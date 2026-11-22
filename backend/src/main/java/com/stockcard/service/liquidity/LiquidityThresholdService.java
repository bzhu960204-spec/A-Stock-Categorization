package com.stockcard.service.liquidity;

import com.stockcard.entity.LiquidityThreshold;
import com.stockcard.repository.LiquidityManualSeriesRepository;
import com.stockcard.repository.LiquidityThresholdRepository;
import com.stockcard.service.liquidity.ThresholdRule.Direction;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

/** Thresholds: a row in the DB wins, otherwise the in-code default applies; "reset" simply deletes the row (design §3.4). */
@Service
public class LiquidityThresholdService {

    public record ThresholdView(String code, String name, String unit, ThresholdRule rule, boolean customized, ThresholdRule defaults) {}

    static final Map<String, ThresholdRule> DEFAULTS = defaults();

    private static Map<String, ThresholdRule> defaults() {
        Map<String, ThresholdRule> m = new LinkedHashMap<>();
        add(m, "SOFR_IORB", Direction.HIGHER_IS_WORSE, -2, 0);
        add(m, "TGCR_IORB", Direction.HIGHER_IS_WORSE, -3, 0);
        add(m, "SOFR_EFFR", Direction.HIGHER_IS_WORSE, -1, 2);
        add(m, "SOFR99_IORB", Direction.HIGHER_IS_WORSE, 3, 10);
        add(m, "LIQ_RATIO", Direction.LOWER_IS_WORSE, 12.5, 11);
        add(m, "SRF_AMT", Direction.HIGHER_IS_WORSE, 1, 25);
        add(m, "ONRRP_AMT", Direction.LOWER_IS_WORSE, 100, 20);
        // QE radar (qe-radar design §3.5): "red / yellow" = strong / weak easing signal, empirical values, editable in settings.
        add(m, "STLFSI4", Direction.HIGHER_IS_WORSE, 0, 1.5);
        add(m, "NFCI", Direction.HIGHER_IS_WORSE, -0.3, 0);
        add(m, "VIX", Direction.HIGHER_IS_WORSE, 25, 35);
        add(m, "HY_OAS", Direction.HIGHER_IS_WORSE, 4.5, 6.0);
        add(m, "SAHM", Direction.HIGHER_IS_WORSE, 0.3, 0.5);
        add(m, "CUT_PRICING", Direction.LOWER_IS_WORSE, -50, -100);
        add(m, "FFTR_HIGH", Direction.LOWER_IS_WORSE, 2.0, 1.0);
        add(m, "RATE_CHANGE_6M", Direction.LOWER_IS_WORSE, -50, -100);
        add(m, "SOMA_13W", Direction.HIGHER_IS_WORSE, 25, 150);
        add(m, "SOMA_LONG_13W", Direction.HIGHER_IS_WORSE, 25, 100);
        add(m, "QE_OPS_28D", Direction.HIGHER_IS_WORSE, 10, 40);
        add(m, "PRIMARY_CREDIT_4W", Direction.HIGHER_IS_WORSE, 10, 50);
        add(m, "CB_SWAPS_4W", Direction.HIGHER_IS_WORSE, 10, 50);
        add(m, "NONSEC_4W", Direction.HIGHER_IS_WORSE, 25, 100);
        add(m, "NET_LIQ_13W", Direction.HIGHER_IS_WORSE, 100, 300);
        return Collections.unmodifiableMap(m);
    }

    private static void add(Map<String, ThresholdRule> m, String code, Direction d, double yellow, double red) {
        m.put(code, new ThresholdRule(code, d, yellow, red, true));
    }

    private final LiquidityThresholdRepository repo;
    private final LiquidityManualSeriesRepository manualRepo;

    public LiquidityThresholdService(LiquidityThresholdRepository repo, LiquidityManualSeriesRepository manualRepo) {
        this.repo = repo;
        this.manualRepo = manualRepo;
    }

    public Optional<ThresholdRule> find(String code) {
        return repo.findById(code).map(LiquidityThresholdService::toRule).or(() -> Optional.ofNullable(DEFAULTS.get(code)));
    }

    /** Effective rules for every indicator that has one. */
    public Map<String, ThresholdRule> effectiveRules() {
        Map<String, ThresholdRule> rules = new LinkedHashMap<>(DEFAULTS);
        repo.findAll().forEach(t -> rules.put(t.getSeriesCode(), toRule(t)));
        return rules;
    }

    public List<ThresholdView> list() {
        Set<String> codes = new LinkedHashSet<>(DEFAULTS.keySet());
        repo.findAll().forEach(t -> codes.add(t.getSeriesCode()));
        Map<String, ThresholdRule> effective = effectiveRules();
        return codes.stream().map(code -> {
            String[] meta = describe(code);
            boolean customized = repo.existsById(code);
            return new ThresholdView(code, meta[0], meta[1], effective.get(code), customized, DEFAULTS.get(code));
        }).toList();
    }

    @Transactional
    public ThresholdRule save(String code, Direction direction, double yellow, double red, boolean enabled) {
        if (!isKnownSeries(code)) throw new IllegalArgumentException("未知序列: " + code);
        if (direction == null) throw new IllegalArgumentException("direction 不能为空");
        if (!Double.isFinite(yellow) || !Double.isFinite(red)) throw new IllegalArgumentException("阈值必须是有效数字");
        ThresholdRule rule = new ThresholdRule(code, direction, yellow, red, enabled);
        if (!rule.isConsistent()) {
            throw new IllegalArgumentException(direction == Direction.HIGHER_IS_WORSE
                    ? "越高越差：黄色阈值必须不大于红色阈值"
                    : "越低越差：黄色阈值必须不小于红色阈值");
        }
        LiquidityThreshold row = repo.findById(code).orElseGet(LiquidityThreshold::new);
        row.setSeriesCode(code);
        row.setDirection(direction.name());
        row.setYellow(yellow);
        row.setRed(red);
        row.setEnabled(enabled);
        repo.save(row);
        return rule;
    }

    @Transactional
    public void reset(String code) {
        repo.deleteById(code);
    }

    private boolean isKnownSeries(String code) {
        return LiquiditySeries.find(code).isPresent() || manualRepo.existsById(code);
    }

    /** {name, unit} for display. */
    private String[] describe(String code) {
        return LiquiditySeries.find(code)
                .map(s -> new String[]{s.label(), s.unit()})
                .or(() -> manualRepo.findById(code).map(m -> new String[]{m.getName(), m.getUnit()}))
                .orElse(new String[]{code, ""});
    }

    private static ThresholdRule toRule(LiquidityThreshold t) {
        return new ThresholdRule(t.getSeriesCode(), Direction.valueOf(t.getDirection()), t.getYellow(), t.getRed(), t.isEnabled());
    }
}
