package com.stockcard.service.liquidity;

import com.stockcard.entity.LiquidityManualSeries;
import com.stockcard.entity.LiquidityObservation;
import com.stockcard.entity.LiquidityObservationId;
import com.stockcard.repository.LiquidityManualSeriesRepository;
import com.stockcard.repository.LiquidityObservationRepository;
import com.stockcard.repository.LiquidityThresholdRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

/** User-defined series (e.g. CDS quotes that have no free feed) and the combined series catalog (design §3.3, §5.7). */
@Service
public class LiquidityManualService {

    public record CatalogEntry(String code, String name, String unit, String frequency, String source,
                               String kind, String group, String description) {}

    /** The prefix keeps manual codes from ever clashing with a built-in code. */
    private static final Pattern CODE = Pattern.compile("^(M|CDS)_[A-Z0-9_]{1,36}$");

    private final LiquidityManualSeriesRepository seriesRepo;
    private final LiquidityObservationRepository obsRepo;
    private final LiquidityThresholdRepository thresholdRepo;

    public LiquidityManualService(LiquidityManualSeriesRepository seriesRepo, LiquidityObservationRepository obsRepo,
                                  LiquidityThresholdRepository thresholdRepo) {
        this.seriesRepo = seriesRepo;
        this.obsRepo = obsRepo;
        this.thresholdRepo = thresholdRepo;
    }

    public List<CatalogEntry> catalog() {
        List<CatalogEntry> out = new ArrayList<>();
        for (LiquiditySeries s : LiquiditySeries.values()) {
            out.add(new CatalogEntry(s.code(), s.label(), s.unit(), s.frequency().name(),
                    s.source() == null ? null : s.source().name(), s.kind().name(), s.group().name(), s.description()));
        }
        for (LiquidityManualSeries m : seriesRepo.findAllByOrderByCodeAsc()) {
            out.add(new CatalogEntry(m.getCode(), m.getName(), m.getUnit(), LiquiditySeries.Frequency.EVENT.name(),
                    LiquiditySource.MANUAL.name(), LiquiditySeries.Kind.MANUAL.name(),
                    LiquiditySeries.Group.MANUAL.name(), m.getDescription()));
        }
        return out;
    }

    public List<LiquidityManualSeries> list() {
        return seriesRepo.findAllByOrderByCodeAsc();
    }

    @Transactional
    public LiquidityManualSeries create(String code, String name, String unit, String description) {
        String normalized = code == null ? "" : code.trim().toUpperCase();
        if (!CODE.matcher(normalized).matches()) {
            throw new IllegalArgumentException("code 必须以 M_ 或 CDS_ 开头，只能包含大写字母、数字和下划线（最长 40 位）");
        }
        if (name == null || name.isBlank() || name.trim().length() > 100) throw new IllegalArgumentException("name 不能为空且不超过 100 字");
        if (unit == null || unit.isBlank() || unit.trim().length() > 20) throw new IllegalArgumentException("unit 不能为空且不超过 20 字");
        if (description != null && description.length() > 500) throw new IllegalArgumentException("description 不能超过 500 字");
        if (seriesRepo.existsById(normalized)) throw new ResponseStatusException(HttpStatus.CONFLICT, "序列已存在: " + normalized);

        LiquidityManualSeries series = new LiquidityManualSeries();
        series.setCode(normalized);
        series.setName(name.trim());
        series.setUnit(unit.trim());
        series.setDescription(description == null || description.isBlank() ? null : description.trim());
        return seriesRepo.save(series);
    }

    /** Deletes the series together with all its observations and any custom threshold. */
    @Transactional
    public void delete(String code) {
        requireSeries(code);
        obsRepo.deleteAllBySeriesCode(code);
        thresholdRepo.deleteById(code);
        seriesRepo.deleteById(code);
    }

    /** Upserts observations (same date overwrites); returns the number of rows written. */
    @Transactional
    public int upsertObservations(String code, List<SeriesPoint> points) {
        requireSeries(code);
        if (points.isEmpty()) throw new IllegalArgumentException("没有可保存的观测值");
        LocalDateTime now = LocalDateTime.now();
        for (SeriesPoint p : points) {
            if (p.date() == null) throw new IllegalArgumentException("date 不能为空");
            if (!Double.isFinite(p.value())) throw new IllegalArgumentException("value 必须是有效数字");
            LiquidityObservation o = new LiquidityObservation();
            o.setSeriesCode(code);
            o.setObsDate(p.date());
            o.setObsValue(p.value());
            o.setSource(LiquiditySource.MANUAL.name());
            o.setFetchedAt(now);
            obsRepo.save(o);
        }
        return points.size();
    }

    @Transactional
    public void deleteObservation(String code, LocalDate date) {
        requireSeries(code);
        LiquidityObservationId id = new LiquidityObservationId(code, date);
        if (!obsRepo.existsById(id)) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "观测值不存在");
        obsRepo.deleteById(id);
    }

    private void requireSeries(String code) {
        if (!seriesRepo.existsById(code)) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "手动序列不存在: " + code);
    }
}
