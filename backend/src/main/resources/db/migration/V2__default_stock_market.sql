-- Stocks created before the market column existed default to A-shares.
-- Replaces the former StartupDataMigrations runner, which re-scanned every stock on each startup.
UPDATE stocks SET market = 'CN' WHERE market IS NULL OR TRIM(market) = '';