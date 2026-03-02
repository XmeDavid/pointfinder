import { useState, useCallback } from "react";
import { Plus, Trash2, Save, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTranslation } from "react-i18next";
import type { Team } from "@/types";
import type { TeamVariableEntry } from "@/lib/api/team-variables";

interface TeamVariablesEditorProps {
  teams: Team[];
  variables: TeamVariableEntry[];
  onSave: (variables: TeamVariableEntry[]) => Promise<void>;
  saving?: boolean;
}

/**
 * Wrap with a key={JSON.stringify(variables)} from the parent if you need
 * to reset internal state when the source data changes after save.
 */
export function TeamVariablesEditor({ teams, variables: initialVariables, onSave, saving }: TeamVariablesEditorProps) {
  const { t } = useTranslation();
  const [edits, setEdits] = useState<TeamVariableEntry[] | null>(null);
  const [newKeyName, setNewKeyName] = useState("");
  const [keyError, setKeyError] = useState("");
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());

  const variables = edits ?? initialVariables;
  const dirty = edits !== null;

  const toggleExpanded = useCallback((key: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const addVariable = useCallback(() => {
    const key = newKeyName.trim();
    if (!key) return;
    if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(key)) {
      setKeyError(t("teamVariables.variableKeyHint"));
      return;
    }
    if (variables.some((v) => v.key === key)) {
      setKeyError(t("teamVariables.duplicateKey"));
      return;
    }
    setKeyError("");
    const teamValues: Record<string, string> = {};
    teams.forEach((team) => { teamValues[team.id] = ""; });
    setEdits([...variables, { key, teamValues }]);
    setExpandedKeys((prev) => new Set(prev).add(key));
    setNewKeyName("");
  }, [newKeyName, variables, teams, t]);

  const removeVariable = useCallback((key: string) => {
    setEdits(variables.filter((v) => v.key !== key));
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }, [variables]);

  const updateValue = useCallback((key: string, teamId: string, value: string) => {
    setEdits(
      variables.map((v) =>
        v.key === key ? { ...v, teamValues: { ...v.teamValues, [teamId]: value } } : v,
      ),
    );
  }, [variables]);

  const handleSave = async () => {
    await onSave(variables);
    setEdits(null);
  };

  if (teams.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("teamVariables.noTeams")}</p>;
  }

  return (
    <div className="space-y-2">
      {variables.map((variable) => {
        const expanded = expandedKeys.has(variable.key);
        const filledCount = teams.filter((team) => (variable.teamValues[team.id] ?? "").trim() !== "").length;
        return (
          <div key={variable.key} className="rounded-md border border-border">
            <div className="flex items-center bg-muted/50 px-3 py-2">
              <button
                type="button"
                className="flex flex-1 items-center gap-2 text-left min-w-0"
                onClick={() => toggleExpanded(variable.key)}
              >
                <ChevronRight className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200 ${expanded ? "rotate-90" : ""}`} />
                <code className="text-sm font-mono font-medium">{`{{${variable.key}}}`}</code>
                {!expanded && (
                  <span className="text-xs text-muted-foreground ml-auto">
                    {t("teamVariables.teamsFilledCount", { filled: filledCount, total: teams.length })}
                  </span>
                )}
              </button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0 ml-2"
                onClick={(e) => { e.stopPropagation(); removeVariable(variable.key); }}
              >
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </Button>
            </div>
            <div
              className="grid transition-[grid-template-rows] duration-200 ease-in-out"
              style={{ gridTemplateRows: expanded ? "1fr" : "0fr" }}
            >
              <div className="overflow-hidden">
                <div className="p-3 space-y-2">
                  {teams.map((team) => (
                    <div key={team.id} className="flex items-center gap-3">
                      <div className="flex items-center gap-2 w-32 shrink-0">
                        <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: team.color }} />
                        <span className="text-sm truncate">{team.name}</span>
                      </div>
                      <Input
                        value={variable.teamValues[team.id] ?? ""}
                        onChange={(e) => updateValue(variable.key, team.id, e.target.value)}
                        placeholder={t("teamVariables.valuePlaceholder")}
                        className="h-8 text-sm"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );
      })}

      <div className="flex items-end gap-2">
        <div className="flex-1">
          <Input
            value={newKeyName}
            onChange={(e) => { setNewKeyName(e.target.value); setKeyError(""); }}
            placeholder={t("teamVariables.variableKeyPlaceholder")}
            className="h-8 text-sm font-mono"
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addVariable(); } }}
          />
          {keyError && <p className="text-xs text-destructive mt-1">{keyError}</p>}
        </div>
        <Button variant="outline" size="sm" onClick={addVariable} disabled={!newKeyName.trim()}>
          <Plus className="mr-1 h-3.5 w-3.5" />{t("teamVariables.addVariable")}
        </Button>
      </div>

      {dirty && (
        <div className="flex justify-end">
          <Button size="sm" onClick={handleSave} disabled={saving}>
            <Save className="mr-1 h-3.5 w-3.5" />{saving ? t("common.saving") : t("common.save")}
          </Button>
        </div>
      )}
    </div>
  );
}
