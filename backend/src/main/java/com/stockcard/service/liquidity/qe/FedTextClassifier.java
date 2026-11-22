package com.stockcard.service.liquidity.qe;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Tags a Fed press release with easing / tightening categories by matching rules sentence by sentence (qe-radar §3.3).
 * The rules are plain data in {@link #RULES}, so adding or retuning a category does not touch the engine.
 */
public final class FedTextClassifier {

    /** One category: it matches a sentence when any {@code include} pattern hits and no {@code exclude} pattern does. */
    public record TextRule(String category, double weight, List<Pattern> include, List<Pattern> exclude) {}

    public record Hit(String category, String sentence) {}

    /** {@code categories} are in rule order; {@code stance} is the sum of the weights of the categories (each counted once). */
    public record Result(List<Hit> hits, List<String> categories, double stance) {}

    public record DirectiveChanges(List<String> added, List<String> removed) {
        public boolean isEmpty() {
            return added.isEmpty() && removed.isEmpty();
        }
    }

    public static final String QE_PURCHASE = "QE_PURCHASE";
    public static final String TAPER = "TAPER";
    public static final String RMP = "RMP";
    public static final String QT_END = "QT_END";
    public static final String QT = "QT";
    public static final String EMERGENCY = "EMERGENCY";
    public static final String CUT = "CUT";
    public static final String HIKE = "HIKE";
    public static final String DISSENT_EASE = "DISSENT_EASE";
    public static final String DISSENT_TIGHTEN = "DISSENT_TIGHTEN";

    static final Pattern SENTENCE_BREAK = Pattern.compile("(?<=[.;])\\s+(?=[A-Z\"])");
    private static final Pattern PREFERRED_NO_CHANGE = pattern("preferred no change");
    private static final Pattern DIRECTIVE_START = pattern("directs the Desk to:");
    private static final int MAX_HITS_PER_CATEGORY = 5;

    private static Pattern pattern(String regex) {
        return Pattern.compile(regex, Pattern.CASE_INSENSITIVE);
    }

    private static TextRule rule(String category, double weight, List<String> include, List<String> exclude) {
        return new TextRule(category, weight, include.stream().map(FedTextClassifier::pattern).toList(),
                exclude.stream().map(FedTextClassifier::pattern).toList());
    }

    public static final List<TextRule> RULES = List.of(
            rule(QE_PURCHASE, 3, List.of(
                    "\\b(increase|add to) (its|the System Open Market Account|the Federal Reserve's) holdings of (longer-term )?(Treasury securities|agency mortgage-backed securities|agency debt)",
                    "\\bprogram to purchase\\b",
                    "\\bpurchas\\w*[^.]{0,40}\\$[\\d.,]+ (billion|trillion)[^.]{0,40}(longer-term Treasury|agency mortgage-backed|agency debt|Treasury securities)",
                    "\\bpurchas\\w* (additional )?(longer-term Treasury securities|agency mortgage-backed securities) at a pace of",
                    "\\bin the amounts needed to support smooth market functioning",
                    "increase the size of the Federal Reserve's balance sheet"),
                    List.of("Treasury bills", "reinvest", "roll over", "ample (level of )?reserves", "rather than", "reduc", "conclude")),
            rule(TAPER, -2, List.of(
                    "reduce the pace of (its )?(asset )?purchases",
                    "at a (somewhat )?(slower|reduced) pace",
                    "rather than \\$",
                    "conclude (its )?asset purchase program",
                    "end (its )?asset purchases"),
                    List.of()),
            rule(RMP, 2, List.of(
                    "reserve management purchases",
                    "\\bpurchas\\w*[^.]{0,30}Treasury bills",
                    "increase[^.]{0,80}holdings[^.]{0,80}Treasury bills",
                    "purchases of shorter-term Treasury securities"),
                    List.of("reinvest")),
            rule(QT_END, 1, List.of(
                    "conclude the reduction",
                    "end the reduction",
                    "stop (reducing|the reduction)",
                    "slow(ing)? the pace of (decline|reduction|runoff)",
                    "reduce the monthly redemption cap",
                    "lower(ing)? the (monthly )?(redemption )?cap"),
                    List.of()),
            rule(QT, -2, List.of(
                    "(begin|initiate|start|continue)[^.]{0,30}(reduc\\w*|reduction of) (its|the Federal Reserve's|its aggregate) (securities )?holdings",
                    "balance sheet normalization program"),
                    List.of("conclude", "slow", "\\bend\\b")),
            rule(EMERGENCY, 2, List.of(
                    "\\bfacility\\b",
                    "section 13\\(3\\)",
                    "liquidity swap",
                    "swap lines?",
                    "Bank Term Funding Program",
                    "term repurchase agreement operations",
                    "additional funding to eligible",
                    "lower(ed)? the primary credit rate"),
                    List.of()),
            rule(CUT, 1, List.of("(decided|voted) to (lower|reduce) the target range"), List.of("preferred")),
            rule(HIKE, -1, List.of("(decided|voted) to (raise|increase) the target range"), List.of("preferred")),
            rule(DISSENT_EASE, 0.5, List.of("preferred to (lower|reduce) the target range"), List.of()),
            rule(DISSENT_TIGHTEN, -0.5, List.of("preferred to (raise|increase) the target range"), List.of()));

    private static final Map<String, Double> WEIGHTS = weights();

    private static Map<String, Double> weights() {
        Map<String, Double> m = new LinkedHashMap<>();
        RULES.forEach(r -> m.put(r.category(), r.weight()));
        return m;
    }

    private FedTextClassifier() {}

    /** Straightens typographic quotes and dashes, turns non-breaking spaces into spaces and collapses whitespace. */
    public static String normalize(String text) {
        return text.replace('\u2018', '\'').replace('\u2019', '\'')
                .replace('\u201C', '"').replace('\u201D', '"')
                .replace('\u2013', '-').replace('\u2014', '-')
                .replace('\u00A0', ' ')
                .replaceAll("\\s+", " ").trim();
    }

    public static List<String> splitSentences(String normalized) {
        List<String> out = new ArrayList<>();
        for (String s : SENTENCE_BREAK.split(normalized)) {
            if (!s.isBlank()) out.add(s.trim());
        }
        return out;
    }

    public static Result classify(String body) {
        String text = normalize(body == null ? "" : body);
        Map<String, List<String>> sentencesByCategory = new LinkedHashMap<>();
        boolean preferredNoChange = false;
        for (String sentence : splitSentences(text)) {
            if (PREFERRED_NO_CHANGE.matcher(sentence).find()) preferredNoChange = true;
            for (TextRule rule : RULES) {
                if (matches(rule, sentence)) sentencesByCategory.computeIfAbsent(rule.category(), k -> new ArrayList<>()).add(sentence);
            }
        }
        // "preferred no change" is a dissent against whatever the Committee decided: hawkish after a cut, dovish after a hike.
        if (preferredNoChange) {
            String dissent = sentencesByCategory.containsKey(CUT) ? DISSENT_TIGHTEN : sentencesByCategory.containsKey(HIKE) ? DISSENT_EASE : null;
            if (dissent != null) {
                List<String> hits = sentencesByCategory.computeIfAbsent(dissent, k -> new ArrayList<>());
                splitSentences(text).stream().filter(s -> PREFERRED_NO_CHANGE.matcher(s).find()).forEach(hits::add);
            }
        }

        List<Hit> hits = new ArrayList<>();
        List<String> categories = new ArrayList<>();
        double stance = 0;
        for (TextRule rule : RULES) {
            List<String> sentences = sentencesByCategory.get(rule.category());
            if (sentences == null) continue;
            categories.add(rule.category());
            stance += rule.weight();
            new LinkedHashSet<>(sentences).stream().limit(MAX_HITS_PER_CATEGORY).forEach(s -> hits.add(new Hit(rule.category(), s)));
        }
        return new Result(hits, categories, stance);
    }

    private static boolean matches(TextRule rule, String sentence) {
        if (rule.exclude().stream().anyMatch(p -> p.matcher(sentence).find())) return false;
        return rule.include().stream().anyMatch(p -> p.matcher(sentence).find());
    }

    public static double weightOf(String category) {
        return WEIGHTS.getOrDefault(category, 0.0);
    }

    // ---- implementation note directives ----

    /** The Desk's instructions: the text after "directs the Desk to:" up to the closing quote; null when the note has none. */
    public static String extractDirective(String body) {
        if (body == null) return null;
        String text = normalize(body);
        Matcher m = DIRECTIVE_START.matcher(text);
        if (!m.find()) return null;
        String rest = text.substring(m.end()).trim();
        int end = rest.indexOf(".\"");
        String directive = end >= 0 ? rest.substring(0, end + 1) : rest;
        return directive.isBlank() ? null : directive;
    }

    /**
     * Sentences added to / removed from the Desk's instructions between two notes. Numbers are blanked to "#" before comparing, so
     * a rate change alone ("3.75 percent" to "3.50 percent") is not reported as a change of instruction. Null when nothing changed.
     */
    public static DirectiveChanges directiveChanges(String previous, String current) {
        if (previous == null || current == null) return null;
        Map<String, String> before = byKey(previous);
        Map<String, String> after = byKey(current);
        List<String> added = after.entrySet().stream().filter(e -> !before.containsKey(e.getKey())).map(Map.Entry::getValue).toList();
        List<String> removed = before.entrySet().stream().filter(e -> !after.containsKey(e.getKey())).map(Map.Entry::getValue).toList();
        DirectiveChanges changes = new DirectiveChanges(added, removed);
        return changes.isEmpty() ? null : changes;
    }

    /** A rate or amount: 3.75, 4, 3-3/4 or 1/2. All of them are blanked to one "#" so that a rate change alone is not an instruction change. */
    private static final Pattern NUMBER = Pattern.compile("\\d+(?:\\.\\d+)?(?:-\\d+/\\d+)?|\\d+/\\d+");

    private static Map<String, String> byKey(String directive) {
        Map<String, String> out = new LinkedHashMap<>();
        for (String sentence : splitSentences(normalize(directive))) {
            out.putIfAbsent(NUMBER.matcher(sentence).replaceAll("#"), sentence);
        }
        return out;
    }

    /** Categories that are worth an in-app alert when a new document carries them (qe-radar §5.5). */
    public static final Set<String> ALERT_CATEGORIES = Set.of(QE_PURCHASE, TAPER, RMP, QT_END, QT, EMERGENCY, CUT);
}
