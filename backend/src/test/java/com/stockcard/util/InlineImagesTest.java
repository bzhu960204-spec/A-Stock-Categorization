package com.stockcard.util;

import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.Base64;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class InlineImagesTest {

    private static final String PNG = Base64.getEncoder().encodeToString(new byte[]{1, 2, 3});
    private static final String GIF = Base64.getEncoder().encodeToString(new byte[]{9, 9});

    private final List<String> stored = new ArrayList<>();
    private final InlineImages images = new InlineImages((type, data) -> {
        stored.add(type + ":" + data.length);
        return "/api/images/" + stored.size();
    });

    @Test
    void replacesHtmlAndMarkdownImagesAndKeepsSurroundingText() throws Exception {
        String html = "<p>a</p><img src=\"data:image/png;base64," + PNG + "\" width=\"300\"><p>b</p>";
        String md = "text ![x](data:image/gif;base64," + GIF + ") end";

        assertThat(images.replaceAll(html)).isEqualTo("<p>a</p><img src=\"/api/images/1\" width=\"300\"><p>b</p>");
        assertThat(images.replaceAll(md)).isEqualTo("text ![x](/api/images/2) end");
        assertThat(stored).containsExactly("image/png:3", "image/gif:2");
    }

    @Test
    void storesIdenticalImagesOnlyOnce() throws Exception {
        String src = "data:image/png;base64," + PNG;
        String out = images.replaceAll("<img src=\"" + src + "\"><img src=\"" + src + "\">");

        assertThat(out).isEqualTo("<img src=\"/api/images/1\"><img src=\"/api/images/1\">");
        assertThat(images.replaceAll("<img src=\"" + src + "\">")).isEqualTo("<img src=\"/api/images/1\">");
        assertThat(images.extractedCount()).isEqualTo(1);
    }

    @Test
    void leavesTextWithoutOrWithBrokenDataUrlsUntouched() throws Exception {
        assertThat(images.replaceAll(null)).isNull();
        assertThat(images.replaceAll("<img src=\"/api/images/5\">")).isEqualTo("<img src=\"/api/images/5\">");
        String broken = "<img src=\"data:image/png;base64,A\">";
        assertThat(images.replaceAll(broken)).isEqualTo(broken);
        assertThat(stored).isEmpty();
    }
}
