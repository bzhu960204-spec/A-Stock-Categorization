-- Market valuation monitor (see docs/market-valuation/design.md). Never edit once released - add a new V<n> migration instead.
CREATE TABLE mv_observation (
    series_code VARCHAR(48)      NOT NULL,
    obs_date    DATE             NOT NULL,
    obs_value   DOUBLE PRECISION NOT NULL,
    source      VARCHAR(20)      NOT NULL,   -- YAHOO / MULTPL / WPR / FACTSET / FRED / MANUAL
    estimate    BOOLEAN          NOT NULL DEFAULT FALSE,
    fetched_at  TIMESTAMP        NOT NULL,
    PRIMARY KEY (series_code, obs_date)
);
CREATE INDEX idx_mv_obs_date ON mv_observation (obs_date);

CREATE TABLE mv_manual_series (
    code        VARCHAR(48)  PRIMARY KEY,    -- must start with "M_" so it can never clash with a built-in code
    name        VARCHAR(100) NOT NULL,
    unit        VARCHAR(20)  NOT NULL,
    description VARCHAR(500),
    created_at  TIMESTAMP    NOT NULL
);

CREATE TABLE mv_fetch_log (
    id            BIGINT AUTO_INCREMENT PRIMARY KEY,
    source        VARCHAR(20)  NOT NULL,
    mode          VARCHAR(20)  NOT NULL,     -- INCREMENTAL / FULL
    range_from    DATE,
    range_to      DATE,
    started_at    TIMESTAMP    NOT NULL,
    finished_at   TIMESTAMP,
    status        VARCHAR(20)  NOT NULL,     -- RUNNING / SUCCESS / PARTIAL / FAILED / SKIPPED
    rows_upserted INT          NOT NULL DEFAULT 0,
    message       VARCHAR(1000)
);

CREATE TABLE mv_factset_report (
    week_friday    DATE         PRIMARY KEY, -- the Friday of the week this row books
    report_date    DATE,                     -- date in the file name (Friday or Thursday); null when NOT_FOUND
    file_name      VARCHAR(60),
    status         VARCHAR(20)  NOT NULL,    -- PARSED / PARSE_FAILED / NOT_FOUND
    fiscal_quarter VARCHAR(10),              -- e.g. "Q3 2026" for FS_EPS_G_Q / FS_REV_G_Q
    message        VARCHAR(1000),
    fetched_at     TIMESTAMP    NOT NULL
);
