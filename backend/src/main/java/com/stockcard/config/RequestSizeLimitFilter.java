package com.stockcard.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.util.unit.DataSize;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

/**
 * Rejects oversized non-multipart request bodies (JSON) with 413 before they are read.
 * Multipart uploads are limited separately by {@code spring.servlet.multipart.*}.
 * Images are uploaded to /api/images, so JSON bodies only carry text and stay small.
 */
@Component
public class RequestSizeLimitFilter extends OncePerRequestFilter {

    private final long maxBytes;

    public RequestSizeLimitFilter(@Value("${app.request.max-body-size:10MB}") DataSize maxBodySize) {
        this.maxBytes = maxBodySize.toBytes();
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String contentType = request.getContentType();
        boolean multipart = contentType != null && contentType.toLowerCase().startsWith("multipart/");
        if (!multipart && request.getContentLengthLong() > maxBytes) {
            response.setStatus(HttpStatus.PAYLOAD_TOO_LARGE.value());
            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
            response.setCharacterEncoding(StandardCharsets.UTF_8.name());
            response.getWriter().write("{\"status\":413,\"error\":\"Payload Too Large\",\"message\":\"请求内容过大（上限 "
                    + DataSize.ofBytes(maxBytes).toMegabytes() + "MB），图片请通过粘贴/拖入上传\"}");
            return;
        }
        chain.doFilter(request, response);
    }
}
