package db.migration;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.Base64;

import static org.assertj.core.api.Assertions.assertThat;

class V3ExtractInlineImagesTest {

    private static final String URL = "jdbc:h2:mem:v3-inline-images;DB_CLOSE_DELAY=-1";
    private static final String PNG = Base64.getEncoder().encodeToString(new byte[]{(byte) 0x89, 'P', 'N', 'G'});

    private static Flyway flyway(String target) {
        var config = Flyway.configure().dataSource(URL, "sa", "").locations("classpath:db/migration");
        if (target != null) config.target(target);
        return config.load();
    }

    @Test
    void movesBase64ImagesIntoStockImagesAndRewritesContent() throws Exception {
        flyway("2").migrate();
        String dataUrl = "data:image/png;base64," + PNG;
        try (Connection c = DriverManager.getConnection(URL, "sa", ""); Statement st = c.createStatement()) {
            st.execute("INSERT INTO stocks (id, code, name, archived, business) VALUES (1, '600519', 'MT', false, '![a](" + dataUrl + ")')");
            st.execute("INSERT INTO stock_documents (id, stock_id, stock_code, stock_name, title, content, created_at, updated_at) VALUES "
                    + "(1, 1, '600519', 'MT', 'doc', '<p>x</p><img src=\"" + dataUrl + "\"><img src=\"" + dataUrl + "\">', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)");
            st.execute("INSERT INTO ideas (id, title, content, rating, created_at, updated_at) VALUES "
                    + "(1, 'plain', '<p>no images</p>', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)");
        }

        flyway(null).migrate();

        try (Connection c = DriverManager.getConnection(URL, "sa", ""); Statement st = c.createStatement()) {
            long imageId;
            try (ResultSet rs = st.executeQuery("SELECT id, content_type, data FROM stock_images")) {
                assertThat(rs.next()).isTrue();
                imageId = rs.getLong(1);
                assertThat(rs.getString(2)).isEqualTo("image/png");
                assertThat(rs.getBytes(3)).containsExactly(0x89, 'P', 'N', 'G');
                assertThat(rs.next()).as("identical images are stored once").isFalse();
            }
            String url = "/api/images/" + imageId;
            assertThat(scalar(st, "SELECT content FROM stock_documents WHERE id = 1"))
                    .isEqualTo("<p>x</p><img src=\"" + url + "\"><img src=\"" + url + "\">");
            assertThat(scalar(st, "SELECT business FROM stocks WHERE id = 1")).isEqualTo("![a](" + url + ")");
            assertThat(scalar(st, "SELECT content FROM ideas WHERE id = 1")).isEqualTo("<p>no images</p>");
        }
    }

    private static String scalar(Statement st, String sql) throws Exception {
        try (ResultSet rs = st.executeQuery(sql)) {
            rs.next();
            return rs.getString(1);
        }
    }
}
