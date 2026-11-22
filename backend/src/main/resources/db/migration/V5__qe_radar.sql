-- QE radar (see docs/liquidity-monitor/qe-radar.md). Never edit once released - add a new V<n> migration instead.
CREATE TABLE fed_text_event (
    id                BIGINT AUTO_INCREMENT PRIMARY KEY,
    url               VARCHAR(300)     NOT NULL UNIQUE,
    doc_date          DATE             NOT NULL,
    title             VARCHAR(500)     NOT NULL,
    doc_type          VARCHAR(20)      NOT NULL,   -- STATEMENT / IMPL_NOTE / MINUTES / OTHER
    body              CLOB             NOT NULL,   -- extracted plain text
    categories        VARCHAR(200)     NOT NULL,   -- comma separated, may be empty
    hits              CLOB             NOT NULL,   -- JSON: [{"category":"RMP","sentence":"..."}]
    stance            DOUBLE PRECISION NOT NULL,
    directive         CLOB,                        -- IMPL_NOTE only
    directive_changes CLOB,                        -- JSON: {"added":[...],"removed":[...]}; NULL for the first note or when nothing changed
    fetched_at        TIMESTAMP        NOT NULL
);
CREATE INDEX idx_fed_text_date ON fed_text_event (doc_date);

CREATE TABLE qe_radar_alert (
    id           BIGINT AUTO_INCREMENT PRIMARY KEY,
    alert_type   VARCHAR(30)   NOT NULL,   -- STAGE_CHANGE / LIKELIHOOD_CHANGE / TEXT_HIT
    title        VARCHAR(200)  NOT NULL,
    detail       VARCHAR(2000),
    ref_date     DATE,
    acknowledged BOOLEAN       NOT NULL,
    created_at   TIMESTAMP     NOT NULL
);
CREATE INDEX idx_qe_alert_ack ON qe_radar_alert (acknowledged);

CREATE TABLE qe_radar_state (
    state_key   VARCHAR(40)  PRIMARY KEY,  -- 'stage' / 'likelihood'
    state_value VARCHAR(200) NOT NULL,
    updated_at  TIMESTAMP    NOT NULL
);
