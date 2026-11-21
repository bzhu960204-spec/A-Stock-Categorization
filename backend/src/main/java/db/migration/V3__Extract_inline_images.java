package db.migration;

import com.stockcard.util.InlineImages;
import org.flywaydb.core.api.migration.BaseJavaMigration;
import org.flywaydb.core.api.migration.Context;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;

/**
 * One-off migration (F8): editors used to embed pasted images as base64 data URLs inside the
 * stored HTML/Markdown. Move each of them into {@code stock_images} and point the content at
 * {@code /api/images/{id}} instead, which shrinks documents and keeps LIKE searches off image bytes.
 */
public class V3__Extract_inline_images extends BaseJavaMigration {

    private static final Logger log = LoggerFactory.getLogger(V3__Extract_inline_images.class);

    /** table, text column — every rich-text column that can hold pasted images. */
    static final String[][] COLUMNS = {
            {"stock_documents", "content"},
            {"earnings_reports", "content"},
            {"earnings_notes", "content"},
            {"ideas", "content"},
            {"idea_comments", "content"},
            {"trades", "content"},
            {"sector_reports", "content"},
            {"industry_chains", "content"},
            {"market_events", "description"},
            {"tech_cycle_phases", "notes"},
            {"stocks", "business"},
            {"stocks", "competitors"},
            {"stocks", "customers"},
            {"stocks", "founder_ceo_holding"},
            {"stocks", "future"},
            {"stocks", "industry_position"},
            {"stocks", "strengths"},
            {"stocks", "strengths_weaknesses"},
            {"stocks", "structural_weaknesses"},
    };

    @Override
    public void migrate(Context context) throws Exception {
        Connection conn = context.getConnection();
        try (PreparedStatement insert = conn.prepareStatement(
                "INSERT INTO stock_images (created_at, content_type, data) VALUES (CURRENT_TIMESTAMP, ?, ?)",
                Statement.RETURN_GENERATED_KEYS)) {
            InlineImages images = new InlineImages((contentType, data) -> {
                insert.setString(1, contentType);
                insert.setBytes(2, data);
                insert.executeUpdate();
                try (ResultSet keys = insert.getGeneratedKeys()) {
                    keys.next();
                    return "/api/images/" + keys.getLong(1);
                }
            });

            int rows = 0;
            for (String[] tc : COLUMNS) {
                rows += migrateColumn(conn, images, tc[0], tc[1]);
            }
            if (rows > 0) {
                log.info("Moved {} inline image(s) out of {} row field(s) into stock_images", images.extractedCount(), rows);
            }
        }
    }

    private static int migrateColumn(Connection conn, InlineImages images, String table, String column) throws Exception {
        record Change(long id, String text) {}
        List<Change> changes = new ArrayList<>();
        try (PreparedStatement select = conn.prepareStatement(
                "SELECT id, " + column + " FROM " + table + " WHERE " + column + " LIKE '%data:image/%'");
             ResultSet rs = select.executeQuery()) {
            while (rs.next()) {
                String original = rs.getString(2);
                String replaced = images.replaceAll(original);
                if (!replaced.equals(original)) changes.add(new Change(rs.getLong(1), replaced));
            }
        }
        if (changes.isEmpty()) return 0;
        try (PreparedStatement update = conn.prepareStatement(
                "UPDATE " + table + " SET " + column + " = ? WHERE id = ?")) {
            for (Change c : changes) {
                update.setString(1, c.text());
                update.setLong(2, c.id());
                update.addBatch();
            }
            update.executeBatch();
        }
        return changes.size();
    }
}
