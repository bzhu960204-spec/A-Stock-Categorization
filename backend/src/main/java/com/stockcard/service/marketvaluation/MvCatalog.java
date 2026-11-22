package com.stockcard.service.marketvaluation;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/** Every built-in series code: the fixed {@link MvSeries} plus the WPE_{market}[_AVG|_SD|_Z]{N}Y family generated per market. */
public final class MvCatalog {

    public record Info(String code, String name, String unit, MvSeries.Frequency frequency, MvSource source, MvSeries.Kind kind,
                       MvSeries.Group group, MvSeries.Direction direction, int typicalLagDays, boolean estimate,
                       String description, List<String> dependencies, boolean needsFred) {}

    private static final Map<String, Info> ALL = build();

    private MvCatalog() {}

    private static Map<String, Info> build() {
        Map<String, Info> map = new LinkedHashMap<>();
        for (MvSeries s : MvSeries.values()) {
            map.put(s.code(), new Info(s.code(), s.label(), s.unit(), s.frequency(), s.source(), s.kind(), s.group(), s.direction(),
                    s.typicalLagDays(), s.estimate(), s.description(), s.dependencies(), s.needsFred()));
        }
        for (MvMarket m : MvMarket.values()) {
            String scope = m.scopeNote() == null ? "" : "；" + m.scopeNote();
            map.put(m.peCode(), wpe(m.peCode(), m.label() + " 当前 PE", "x", MvSource.WPR, List.of(), "worldperatio 基于 ETF 的 TTM PE，自上线起逐日积累" + scope));
            for (int n : MvMarket.YEARS) {
                map.put(m.avgCode(n), wpe(m.avgCode(n), m.label() + " " + n + " 年均值", "x", MvSource.WPR, List.of(), "过去 " + n + " 年滚动均值 μ"));
                map.put(m.sdCode(n), wpe(m.sdCode(n), m.label() + " " + n + " 年标准差", "x", MvSource.WPR, List.of(), "过去 " + n + " 年滚动标准差 σ"));
                map.put(m.zCode(n), wpe(m.zCode(n), m.label() + " PE 相对 " + n + " 年 z 分数", "σ", null,
                        List.of(m.peCode(), m.avgCode(n), m.sdCode(n)), "(当前 PE − μ) ÷ σ"));
            }
        }
        return map;
    }

    private static Info wpe(String code, String name, String unit, MvSource source, List<String> deps, String description) {
        return new Info(code, name, unit, MvSeries.Frequency.DAILY, source, source == null ? MvSeries.Kind.DERIVED : MvSeries.Kind.RAW,
                MvSeries.Group.MARKETS, MvSeries.Direction.NONE, 5, false, description, deps, false);
    }

    public static Optional<Info> find(String code) {
        return Optional.ofNullable(code == null ? null : ALL.get(code));
    }

    public static List<Info> all() {
        return new ArrayList<>(ALL.values());
    }
}
