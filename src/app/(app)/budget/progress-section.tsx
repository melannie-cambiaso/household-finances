import { barWidth, type Progress, type ProgressReport } from "@/lib/budget";
import { formatClp } from "@/lib/expenses";

function Bar({ progress, tone }: { progress: Progress; tone: "expense" | "income" }) {
  // Spending past the plan is a warning; income past the plan is good news.
  const bad = tone === "expense" && progress.over;
  return (
    <div
      className="h-2 w-full overflow-hidden rounded-full bg-page"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={barWidth(progress)}
    >
      <div
        className={`h-full rounded-full ${bad ? "bg-expense" : "bg-accent"}`}
        style={{ width: `${barWidth(progress)}%` }}
      />
    </div>
  );
}

function Figures({
  progress,
  tone,
}: {
  progress: Progress;
  tone: "expense" | "income";
}) {
  const left = progress.remaining;
  const word = tone === "expense" ? "Spent" : "Received";
  return (
    <p className="text-sm text-muted">
      {word}{" "}
      <span className="font-numeric">{formatClp(progress.actual)}</span> of{" "}
      <span className="font-numeric">{formatClp(progress.planned)}</span>
      {progress.percent !== null && ` (${progress.percent}%)`} ·{" "}
      {left >= 0 ? "left" : tone === "expense" ? "over by" : "above plan by"}{" "}
      <span
        className={`font-numeric ${tone === "expense" && left < 0 ? "text-expense" : ""}`}
      >
        {formatClp(Math.abs(left))}
      </span>
    </p>
  );
}

export function ProgressSection({ report }: { report: ProgressReport }) {
  return (
    <>
      <section className="rounded-card border border-line bg-surface p-6">
        <h2 className="mb-1 text-xl">Spending vs. budget</h2>
        <div className="mb-5 grid gap-1">
          <Figures progress={report.expenseTotal} tone="expense" />
          <Bar progress={report.expenseTotal} tone="expense" />
        </div>

        {report.categories.length === 0 ? (
          <p className="text-muted">No spending or plans yet.</p>
        ) : (
          <div className="grid gap-6">
            {report.categories.map((category) => (
              <div key={category.id} className="grid gap-3">
                <div className="grid gap-1">
                  <h3>{category.name}</h3>
                  <Figures progress={category.progress} tone="expense" />
                  <Bar progress={category.progress} tone="expense" />
                </div>
                <ul className="grid gap-3 border-l border-line pl-4">
                  {category.items.map((item) => (
                    <li key={item.id} className="grid gap-1">
                      <p>
                        {item.name}
                        {item.unplanned && (
                          <span className="ml-2 rounded-full border border-line px-2 text-xs text-muted">
                            not planned
                          </span>
                        )}
                      </p>
                      <Figures progress={item.progress} tone="expense" />
                      <Bar progress={item.progress} tone="expense" />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-card border border-line bg-surface p-6">
        <h2 className="mb-1 text-xl">Income vs. budget</h2>
        <div className="mb-5 grid gap-1">
          <Figures progress={report.incomeTotal} tone="income" />
          <Bar progress={report.incomeTotal} tone="income" />
        </div>

        {report.sources.length === 0 ? (
          <p className="text-muted">No income or plans yet.</p>
        ) : (
          <ul className="grid gap-4">
            {report.sources.map((source) => (
              <li key={source.id} className="grid gap-1">
                <p>
                  {source.name}
                  {source.unplanned && (
                    <span className="ml-2 rounded-full border border-line px-2 text-xs text-muted">
                      not planned
                    </span>
                  )}
                </p>
                <Figures progress={source.progress} tone="income" />
                <Bar progress={source.progress} tone="income" />
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
