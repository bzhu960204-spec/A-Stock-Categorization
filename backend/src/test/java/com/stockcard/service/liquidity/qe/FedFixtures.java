package com.stockcard.service.liquidity.qe;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

/** Loads the recorded Fed pages under src/test/resources/liquidity/qe (tests never touch the network). */
final class FedFixtures {

    private FedFixtures() {}

    static byte[] bytes(String name) {
        try (InputStream in = FedFixtures.class.getResourceAsStream("/liquidity/qe/" + name)) {
            if (in == null) throw new IllegalStateException("Missing fixture " + name);
            return in.readAllBytes();
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
    }

    static String text(String name) {
        return new String(bytes(name), StandardCharsets.UTF_8);
    }

    /** The extracted body of {@code fed-<id>.html}. */
    static String body(String id) {
        return FedHtml.extractText(text("fed-" + id + ".html"));
    }
}
