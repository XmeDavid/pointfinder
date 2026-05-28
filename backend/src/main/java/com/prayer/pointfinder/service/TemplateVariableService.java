package com.prayer.pointfinder.service;

import com.prayer.pointfinder.entity.ChallengeTeamVariable;
import com.prayer.pointfinder.entity.TeamVariable;
import com.prayer.pointfinder.repository.ChallengeTeamVariableRepository;
import com.prayer.pointfinder.repository.TeamVariableRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class TemplateVariableService {

    // Variable keys must start with a letter and contain only letters,
    // digits, and underscores. This MUST stay in sync with the go-live
    // validator (TeamVariableService.VARIABLE_REF_PATTERN) and all clients;
    // a looser pattern here would let a challenge go live with a reference
    // the validator cannot see (e.g. {{1foo}}, {{_x}}), which then renders
    // as a literal placeholder to players.
    private static final String KEY_PATTERN = "[a-zA-Z][a-zA-Z0-9_]*";
    private static final Pattern VARIABLE_PATTERN = Pattern.compile("\\{\\{(" + KEY_PATTERN + ")}}");
    private static final Pattern HTML_ENCODED_PATTERN = Pattern.compile(
            "\\{\\{(" + KEY_PATTERN + ")}}|&#123;&#123;(" + KEY_PATTERN + ")&#125;&#125;");

    private final TeamVariableRepository teamVariableRepository;
    private final ChallengeTeamVariableRepository challengeTeamVariableRepository;

    /**
     * Resolve all {{variableName}} placeholders in the template.
     * Challenge-level variables override game-level variables with the same key.
     * Unresolved variables are left as-is.
     */
    public String resolveTemplate(String template, UUID gameId, UUID challengeId, UUID teamId) {
        if (template == null || template.isEmpty()
                || (!template.contains("{{") && !template.contains("&#123;"))) {
            return template;
        }

        Map<String, String> variables = buildVariableMap(gameId, challengeId, teamId);
        if (variables.isEmpty()) {
            return template;
        }

        Matcher matcher = HTML_ENCODED_PATTERN.matcher(template);
        StringBuilder result = new StringBuilder();
        while (matcher.find()) {
            String key = matcher.group(1) != null ? matcher.group(1) : matcher.group(2);
            String replacement = variables.getOrDefault(key, matcher.group(0));
            // HTML-escape variable values to prevent post-sanitization XSS injection
            if (!replacement.equals(matcher.group(0))) {
                replacement = replacement
                    .replace("&", "&amp;")
                    .replace("<", "&lt;")
                    .replace(">", "&gt;")
                    .replace("\"", "&quot;")
                    .replace("'", "&#39;");
            }
            matcher.appendReplacement(result, Matcher.quoteReplacement(replacement));
        }
        matcher.appendTail(result);
        return result.toString();
    }

    /**
     * Resolve variables in a list of strings (used for correctAnswer list).
     */
    public List<String> resolveTemplates(List<String> templates, UUID gameId, UUID challengeId, UUID teamId) {
        if (templates == null) return null;
        return templates.stream()
                .map(t -> resolveTemplate(t, gameId, challengeId, teamId))
                .toList();
    }

    private Map<String, String> buildVariableMap(UUID gameId, UUID challengeId, UUID teamId) {
        Map<String, String> variables = new HashMap<>();

        // Game-level variables (base layer)
        List<TeamVariable> gameVars = teamVariableRepository.findByGameIdAndTeamId(gameId, teamId);
        for (TeamVariable v : gameVars) {
            variables.put(v.getVariableKey(), v.getVariableValue());
        }

        // Challenge-level variables (override layer)
        if (challengeId != null) {
            List<ChallengeTeamVariable> challengeVars = challengeTeamVariableRepository
                    .findByChallengeIdAndTeamId(challengeId, teamId);
            for (ChallengeTeamVariable v : challengeVars) {
                variables.put(v.getVariableKey(), v.getVariableValue());
            }
        }

        return variables;
    }
}
