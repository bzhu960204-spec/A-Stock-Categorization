package com.stockcard.service.marketvaluation;

/** The markets compared on the worldperatio-based tab (design §3.1.3). */
public enum MvMarket {
    SPX("标普 500", "index/sp-500/", null),
    NDX("纳指 100", "index/nasdaq-100/", null),
    DJI("道琼斯", "index/dow-jones/", null),
    RUT("罗素 2000", "index/russell-2000/", null),
    CN("中国市场", "area/china/", "市场级口径（MSCI / ETF 代理），不是沪深 300"),
    HK("中国香港市场", "area/hong-kong/", "市场级口径，不是恒生指数"),
    JP("日本市场", "area/japan/", "市场级口径，不是日经 225");

    /** Rolling windows worldperatio publishes statistics for. */
    public static final int[] YEARS = {1, 5, 10, 20};

    private final String label;
    private final String path;
    private final String scopeNote;

    MvMarket(String label, String path, String scopeNote) {
        this.label = label;
        this.path = path;
        this.scopeNote = scopeNote;
    }

    public String label() { return label; }
    public String path() { return path; }
    /** Non-null for the market-level (not index-level) pages. */
    public String scopeNote() { return scopeNote; }

    public String peCode() { return "WPE_" + name(); }
    public String avgCode(int years) { return "WPE_" + name() + "_AVG" + years + "Y"; }
    public String sdCode(int years) { return "WPE_" + name() + "_SD" + years + "Y"; }
    public String zCode(int years) { return "WPE_" + name() + "_Z" + years + "Y"; }
}
