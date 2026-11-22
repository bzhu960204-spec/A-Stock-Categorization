-- Liquidity monitor (see docs/liquidity-monitor/design.md). Never edit once released - add a new V<n> migration instead.
CREATE TABLE liquidity_observation (
    series_code VARCHAR(40)      NOT NULL,
    obs_date    DATE             NOT NULL,
    obs_value   DOUBLE PRECISION NOT NULL,
    source      VARCHAR(20)      NOT NULL,   -- NYFED / TREASURY / FRED / MANUAL
    fetched_at  TIMESTAMP        NOT NULL,
    PRIMARY KEY (series_code, obs_date)
);
CREATE INDEX idx_liq_obs_date ON liquidity_observation (obs_date);

CREATE TABLE liquidity_manual_series (
    code        VARCHAR(40)  PRIMARY KEY,    -- must start with "M_" or "CDS_" so it can never clash with a built-in code
    name        VARCHAR(100) NOT NULL,
    unit        VARCHAR(20)  NOT NULL,
    description VARCHAR(500),
    created_at  TIMESTAMP    NOT NULL
);

CREATE TABLE liquidity_threshold (
    series_code VARCHAR(40)      PRIMARY KEY,
    direction   VARCHAR(20)      NOT NULL,   -- HIGHER_IS_WORSE / LOWER_IS_WORSE
    yellow      DOUBLE PRECISION NOT NULL,
    red         DOUBLE PRECISION NOT NULL,
    enabled     BOOLEAN          NOT NULL,
    updated_at  TIMESTAMP        NOT NULL
);

CREATE TABLE liquidity_fetch_log (
    id            BIGINT AUTO_INCREMENT PRIMARY KEY,
    source        VARCHAR(20)  NOT NULL,
    mode          VARCHAR(20)  NOT NULL,     -- INCREMENTAL / FULL
    range_from    DATE,
    range_to      DATE,
    started_at    TIMESTAMP    NOT NULL,
    finished_at   TIMESTAMP,
    status        VARCHAR(20)  NOT NULL,     -- RUNNING / SUCCESS / FAILED / SKIPPED
    rows_upserted INT          NOT NULL DEFAULT 0,
    message       VARCHAR(1000)
);

CREATE TABLE liquidity_weekly_report (
    id          BIGINT AUTO_INCREMENT PRIMARY KEY,
    week_end    DATE      NOT NULL UNIQUE,   -- the Friday of that week
    payload     CLOB      NOT NULL,          -- frozen weekly report JSON (later data revisions do not change a snapshot)
    commentary  CLOB,                        -- the user's own notes (Markdown)
    created_at  TIMESTAMP NOT NULL,
    updated_at  TIMESTAMP NOT NULL
);
