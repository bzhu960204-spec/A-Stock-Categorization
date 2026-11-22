package com.stockcard.service.liquidity.qe;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.stockcard.entity.FedTextEvent;
import com.stockcard.entity.QeRadarAlert;
import com.stockcard.repository.FedTextEventRepository;
import com.stockcard.repository.QeRadarAlertRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/** Stores new Fed press releases with their classification and raises text alerts (qe-radar §5.3, §5.5). */
@Service
public class FedTextService {

    /** Only documents this recent can raise an alert; older ones are history. */
    private static final int ALERT_WINDOW_DAYS = 30;
    private static final int MAX_DETAIL = 2000;

    private static final Map<String, String> CATEGORY_LABELS = labels();

    private static Map<String, String> labels() {
        Map<String, String> m = new LinkedHashMap<>();
        m.put(FedTextClassifier.QE_PURCHASE, "购买长债/MBS（QE）");
        m.put(FedTextClassifier.TAPER, "放缓购买");
        m.put(FedTextClassifier.RMP, "购买短债（RMP）");
        m.put(FedTextClassifier.QT_END, "缩表放缓/结束");
        m.put(FedTextClassifier.QT, "缩表");
        m.put(FedTextClassifier.EMERGENCY, "紧急工具");
        m.put(FedTextClassifier.CUT, "降息");
        m.put(FedTextClassifier.HIKE, "加息");
        m.put(FedTextClassifier.DISSENT_EASE, "偏鸽异议");
        m.put(FedTextClassifier.DISSENT_TIGHTEN, "偏鹰异议");
        return m;
    }

    private final FedTextClient client;
    private final FedTextEventRepository repo;
    private final QeRadarAlertRepository alertRepo;
    private final ObjectMapper mapper;
    private final Clock clock;

    @Autowired
    public FedTextService(FedTextClient client, FedTextEventRepository repo, QeRadarAlertRepository alertRepo, ObjectMapper mapper) {
        this(client, repo, alertRepo, mapper, Clock.systemDefaultZone());
    }

    FedTextService(FedTextClient client, FedTextEventRepository repo, QeRadarAlertRepository alertRepo, ObjectMapper mapper, Clock clock) {
        this.client = client;
        this.repo = repo;
        this.alertRepo = alertRepo;
        this.mapper = mapper;
        this.clock = clock;
    }

    public LocalDate latestDocDate() {
        return repo.maxDocDate();
    }

    /**
     * Fetches and stores the documents that are not stored yet and returns how many were added. {@code full} (or an empty table)
     * also back-fills the historical pages. A page whose text cannot be extracted is skipped and reported with its URL in the
     * exception raised after the others have been stored.
     */
    public int sync(boolean full) {
        long existing = repo.count();
        Set<String> known = new HashSet<>(repo.findAllUrls());
        List<FedDocument> docs = new ArrayList<>(client.fetch(known, full || existing == 0));
        docs.sort(Comparator.comparing(FedDocument::docDate).thenComparing(FedDocument::url));

        // The very first run back-fills history, which must not look like news.
        boolean alertsEnabled = existing > 0;
        LocalDate today = LocalDate.now(clock);
        List<String> failed = new ArrayList<>();
        int added = 0;
        for (FedDocument doc : docs) {
            if (!FedTextClient.isAllowed(doc.url()) || known.contains(doc.url())) continue;
            if (doc.body() == null || doc.body().isBlank()) {
                failed.add(doc.url());
                continue;
            }
            store(doc, alertsEnabled, today);
            known.add(doc.url());
            added++;
        }
        if (!failed.isEmpty()) throw new IllegalStateException("正文提取为空，未入库：" + String.join("、", failed));
        return added;
    }

    private void store(FedDocument doc, boolean alertsEnabled, LocalDate today) {
        FedTextClassifier.Result result = FedTextClassifier.classify(doc.body());

        String directive = null;
        FedTextClassifier.DirectiveChanges changes = null;
        if (doc.docType() == FedDocType.IMPL_NOTE) {
            directive = FedTextClassifier.extractDirective(doc.body());
            String previous = repo.findFirstByDocTypeAndDocDateBeforeOrderByDocDateDescIdDesc(FedDocType.IMPL_NOTE.name(), doc.docDate())
                    .map(FedTextEvent::getDirective).orElse(null);
            changes = FedTextClassifier.directiveChanges(previous, directive);
        }

        FedTextEvent row = new FedTextEvent();
        row.setUrl(doc.url());
        row.setDocDate(doc.docDate());
        row.setTitle(abbreviate(doc.title().isBlank() ? doc.url() : doc.title(), 500));
        row.setDocType(doc.docType().name());
        row.setBody(doc.body());
        row.setCategories(String.join(",", result.categories()));
        row.setHits(toJson(result.hits()));
        // Minutes recap earlier decisions, so they are shown but never scored.
        row.setStance(doc.docType() == FedDocType.MINUTES ? 0 : result.stance());
        row.setDirective(directive);
        row.setDirectiveChanges(changes == null ? null : toJson(changes));
        row.setFetchedAt(LocalDateTime.now(clock));
        repo.save(row);

        if (alertsEnabled && doc.docType() != FedDocType.MINUTES && !doc.docDate().isBefore(today.minusDays(ALERT_WINDOW_DAYS))) {
            boolean notable = result.categories().stream().anyMatch(FedTextClassifier.ALERT_CATEGORIES::contains);
            if (notable || changes != null) alertRepo.save(textAlert(doc, result, changes));
        }
    }

    private QeRadarAlert textAlert(FedDocument doc, FedTextClassifier.Result result, FedTextClassifier.DirectiveChanges changes) {
        String labels = result.categories().stream().map(c -> CATEGORY_LABELS.getOrDefault(c, c)).collect(Collectors.joining("、"));
        StringBuilder detail = new StringBuilder();
        if (!labels.isEmpty()) detail.append("命中：").append(labels).append('\n');
        result.hits().stream().filter(h -> FedTextClassifier.ALERT_CATEGORIES.contains(h.category())).limit(3)
                .forEach(h -> detail.append("· ").append(h.sentence()).append('\n'));
        if (changes != null) {
            changes.added().forEach(s -> detail.append("+ 新增指令：").append(s).append('\n'));
            changes.removed().forEach(s -> detail.append("− 删除指令：").append(s).append('\n'));
        }
        QeRadarAlert alert = new QeRadarAlert();
        alert.setAlertType("TEXT_HIT");
        alert.setTitle(abbreviate("联储文本 " + doc.docDate() + "：" + (labels.isEmpty() ? "实施细则指令变化" : labels), 200));
        alert.setDetail(abbreviate(detail.toString().trim(), MAX_DETAIL));
        alert.setRefDate(doc.docDate());
        alert.setAcknowledged(false);
        alert.setCreatedAt(LocalDateTime.now(clock));
        return alert;
    }

    private String toJson(Object value) {
        try {
            return mapper.writeValueAsString(value);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("无法序列化联储文本分类结果", e);
        }
    }

    private static String abbreviate(String text, int max) {
        return text.length() <= max ? text : text.substring(0, max - 1) + "…";
    }
}
