export type TeamRow = {
  id: string;
  name: string;
  completedBases: number;
  score: number;
};

export default function TeamsTable({ teams }: { teams: TeamRow[] }) {
  return (
    <div className="border rounded overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-foreground/5">
          <tr>
            <th className="text-left p-2">Team</th>
            <th className="text-left p-2">Completed</th>
            <th className="text-left p-2">Score</th>
          </tr>
        </thead>
        <tbody>
          {teams.map((t) => (
            <tr key={t.id} className="border-t">
              <td className="p-2">{t.name}</td>
              <td className="p-2">{t.completedBases}</td>
              <td className="p-2">{t.score}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}


