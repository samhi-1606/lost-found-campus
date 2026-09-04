const steps = [
  { id: "pick", label: "Safe location" },
  { id: "route", label: "Safe route" },
  { id: "meet", label: "Confirm handover" },
  { id: "done", label: "You're done" },
];

const order = ["pick", "route", "meet", "done"];

export default function HandoverStatus({ current = "pick" }) {
  const active = order.indexOf(current);
  return (
    <ol className="handover-status">
      {steps.map((step, index) => {
        const state = index < active ? "done" : index === active ? "current" : "next";
        return (
          <li key={step.id} className={`handover-status-step ${state}`}>
            <span className="handover-status-dot">{state === "done" ? "✓" : index + 1}</span>
            <span>{step.label}</span>
          </li>
        );
      })}
    </ol>
  );
}
