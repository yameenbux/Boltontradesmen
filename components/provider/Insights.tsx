import type { Insights as Data } from "@/lib/insights";
import { plural } from "@/lib/enquiries";

/**
 * "Who's looking": views of the trader's page (everyone), and with Pro, the last 30 days' demand for each of their
 * trades: visits to the trade's page and Ask Bolton questions in their areas. Counts only, nobody named.
 */
export function Insights({ data, id }: { data: Data; id: string }) {
  const { thisMonth, lastMonth } = data.views;
  return (
    <div className="insights">
      <p className="insight-big" data-testid={`views-${id}`}>
        <b>{thisMonth}</b> {thisMonth === 1 ? "view" : "views"} of your page this month
      </p>
      <p className="hint">
        {plural(lastMonth, "view", "views")} last month. One view per person a day; your own visits don&apos;t count.
      </p>
      {data.demand ? (
        <div className="demand" data-testid={`demand-${id}`}>
          <h3>Your trade in Bolton, last 30 days</h3>
          <ul>
            {data.demand.map((t) => (
              <li key={t.slug}>
                <b>{t.name}</b>
                <span>{plural(t.pageViews, "visit", "visits")} to Bolton&apos;s {t.name.toLowerCase()} page</span>
                <span>{plural(t.questions, "Ask Bolton question", "Ask Bolton questions")} in your areas</span>
              </li>
            ))}
          </ul>
          <p className="hint">Each visit is someone looking for your trade. Answer the questions to be first in line.</p>
        </div>
      ) : (
        <p className="hint">
          With Pro, see how many people looked for your trade in Bolton this month, and the questions asked in your
          areas.
        </p>
      )}
    </div>
  );
}
