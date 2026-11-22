package com.stockcard.service.liquidity.qe;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

/** The historical easing episodes the radar is replayed against (qe-radar §6). */
public final class QeEpisodes {

    public record Episode(String id, String name, List<LocalDate> keyDates, String type, String summary) {
        /** From 180 days before the first key date to 90 days after the last one. */
        public LocalDate windowFrom() {
            return keyDates.get(0).minusDays(180);
        }

        public LocalDate windowTo() {
            return keyDates.get(keyDates.size() - 1).plusDays(90);
        }
    }

    public static final List<Episode> ALL = List.of(
            new Episode("QE1_2008", "QE1 首轮量化宽松", dates("2008-11-25", "2009-03-18"), "QE",
                    "雷曼倒闭后，紧急工具已经用满，开始买 MBS"),
            new Episode("QE2_2010", "QE2", dates("2010-11-03"), "QE",
                    "没有危机，因为经济复苏太弱而加码；8 月杰克逊霍尔会议已有暗示"),
            new Episode("QE3_2012", "QE3 无限期购买", dates("2012-09-13", "2012-12-12"), "QE",
                    "失业率高企，开始每月买 400 亿美元 MBS，不设上限"),
            new Episode("REPO_2019", "2019 回购危机", dates("2019-09-17", "2019-10-11"), "L3 → L2",
                    "准备金太少，回购利率一天飙到 10%。官方强调“不是 QE”"),
            new Episode("COVID_2020", "疫情无限 QE", dates("2020-03-15", "2020-03-23"), "QE",
                    "史上最快的放水，两周内从降息到无限量购买"),
            new Episode("SVB_2023", "硅谷银行危机", dates("2023-03-12"), "L3（对照组）",
                    "只救急，没有 QE。用来对比“救急”和“放水”的区别"),
            new Episode("RMP_2025", "结束缩表 + 储备管理购买", dates("2025-10-29", "2025-12-10"), "L1 → L2",
                    "准备金逼近“悬崖”，先停止收水，再买短债"));

    private QeEpisodes() {}

    public static Optional<Episode> find(String id) {
        return ALL.stream().filter(e -> e.id().equals(id)).findFirst();
    }

    private static List<LocalDate> dates(String... iso) {
        return java.util.Arrays.stream(iso).map(LocalDate::parse).toList();
    }
}
