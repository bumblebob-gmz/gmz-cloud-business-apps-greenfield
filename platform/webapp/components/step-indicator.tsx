type StepIndicatorProps = {
  steps: string[];
  currentStep: number;
};

export function StepIndicator({ steps, currentStep }: StepIndicatorProps) {
  return (
    <ol className="grid gap-2 md:grid-cols-3 xl:grid-cols-6">
      {steps.map((name, idx) => {
        const isActive = idx === currentStep;
        const isDone = idx < currentStep;

        return (
          <li
            key={name}
            className={`rounded-lg border px-3 py-2 text-xs transition ${
              isActive
                ? 'border-brand bg-brand text-white'
                : isDone
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : 'border-slate-200 bg-slate-50 text-slate-600'
            }`}
          >
            <span className="font-semibold">{idx + 1}.</span> {name}
          </li>
        );
      })}
    </ol>
  );
}
