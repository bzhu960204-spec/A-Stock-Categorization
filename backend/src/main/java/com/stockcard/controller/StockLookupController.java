package com.stockcard.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestTemplate;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/lookup")
@CrossOrigin(origins = "http://localhost:5173")
public class StockLookupController {

    private final RestTemplate restTemplate = new RestTemplate();
    private static final String TOKEN = "D43BF722C8E33BDC906FB84D85E326E8";

    /**
     * 通过股票代码或名称查询股票信息
     * 使用东方财富公开接口
     */
    @GetMapping
    public ResponseEntity<Map<String, String>> lookup(@RequestParam String keyword) {
        try {
            String encodedKeyword = URLEncoder.encode(keyword, StandardCharsets.UTF_8);
            String url = "https://searchapi.eastmoney.com/api/suggest/get?input=" + encodedKeyword + "&type=14&token=" + TOKEN + "&count=1";
            Map<?, ?> response = restTemplate.getForObject(url, Map.class);

            List<Map<String, String>> suggestions = extractSuggestions(response);
            if (!suggestions.isEmpty()) {
                return ResponseEntity.ok(suggestions.get(0));
            }
            return ResponseEntity.ok(Map.of("code", "", "name", "", "error", "未找到"));
        } catch (Exception e) {
            return ResponseEntity.ok(Map.of("code", "", "name", "", "error", "查询失败: " + e.getMessage()));
        }
    }

    @GetMapping("/suggest")
    public ResponseEntity<List<Map<String, String>>> suggest(
            @RequestParam String keyword,
            @RequestParam(defaultValue = "8") int limit) {
        try {
            if (keyword == null || keyword.trim().isEmpty()) {
                return ResponseEntity.ok(List.of());
            }

            int safeLimit = Math.min(Math.max(limit, 1), 20);
            String encodedKeyword = URLEncoder.encode(keyword.trim(), StandardCharsets.UTF_8);
            String url = "https://searchapi.eastmoney.com/api/suggest/get?input=" + encodedKeyword + "&type=14&token=" + TOKEN + "&count=" + safeLimit;
            Map<?, ?> response = restTemplate.getForObject(url, Map.class);

            return ResponseEntity.ok(extractSuggestions(response));
        } catch (Exception e) {
            return ResponseEntity.ok(List.of());
        }
    }

    private List<Map<String, String>> extractSuggestions(Map<?, ?> response) {
        List<Map<String, String>> result = new ArrayList<>();
        if (response == null || !response.containsKey("QuotationCodeTable")) {
            return result;
        }

        Object tableObject = response.get("QuotationCodeTable");
        if (!(tableObject instanceof Map<?, ?> table)) {
            return result;
        }

        if (table == null || !table.containsKey("Data")) {
            return result;
        }

        List<?> dataList = (List<?>) table.get("Data");
        if (dataList == null) {
            return result;
        }

        for (Object item : dataList) {
            if (!(item instanceof Map itemMap)) {
                continue;
            }

            Object codeObj = itemMap.get("Code");
            Object nameObj = itemMap.get("Name");
            if (codeObj == null || nameObj == null) {
                continue;
            }

            String code = String.valueOf(codeObj).trim();
            String name = String.valueOf(nameObj).trim();
            if (!code.isEmpty() && !name.isEmpty()) {
                result.add(Map.of("code", code, "name", name));
            }
        }

        return result;
    }
}
