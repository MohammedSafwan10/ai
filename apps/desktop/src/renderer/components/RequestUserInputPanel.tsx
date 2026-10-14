import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, MessageSquareMore } from "lucide-react";
import type { RequestUserInputRequestRecord } from "../../shared/types";

export function RequestUserInputPanel({
  request,
  onSubmit,
}: {
  request: RequestUserInputRequestRecord;
  onSubmit: (answers: Record<string, { answers: string[] }>) => Promise<void>;
}) {
  const [selected, setSelected] = useState<Record<string, string>>(() =>
    Object.fromEntries(request.questions.map((question) => [question.id, question.options[0]?.label || ""])),
  );
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [index, setIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const question = request.questions[Math.min(index, request.questions.length - 1)];
  const isFirst = index === 0;
  const isLast = index === request.questions.length - 1;

  useEffect(() => {
    setSelected(Object.fromEntries(request.questions.map((question) => [question.id, question.options[0]?.label || ""])));
    setNotes({});
    setIndex(0);
    setSubmitting(false);
  }, [request.callId, request.questions]);

  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);
    const answers = Object.fromEntries(request.questions.map((question) => {
      const values = [selected[question.id]].filter(Boolean);
      const note = notes[question.id]?.trim();
      if (note) values.push(`user_note: ${note}`);
      return [question.id, { answers: values }];
    }));
    try { await onSubmit(answers); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); setSubmitting(false); }
  };

  if (!question) return null;

  return (
    <section className="request-user-input-panel" aria-label="Plan question">
      <div className="request-user-input-header">
        <div>
          <MessageSquareMore size={15} />
          <span>{request.questions.length === 1 ? "Question" : `Question ${index + 1}/${request.questions.length}`}</span>
        </div>
        {request.questions.length > 1 && (
          <div className="request-user-input-nav" aria-label="Question navigation">
            <button
              type="button"
              title="Previous question"
              disabled={isFirst}
              onClick={() => setIndex((current) => Math.max(0, current - 1))}
            >
              <ChevronLeft size={15} />
            </button>
            <button
              type="button"
              title="Next question"
              disabled={isLast}
              onClick={() => setIndex((current) => Math.min(request.questions.length - 1, current + 1))}
            >
              <ChevronRight size={15} />
            </button>
          </div>
        )}
      </div>
      <div className="request-user-input-question" key={question.id}>
        <small>{question.header}</small>
        <p>{question.question}</p>
        <div className="request-user-input-options">
          {question.options.map((option) => (
            <button
              type="button"
              key={option.label}
              className={selected[question.id] === option.label ? "active" : undefined}
              onClick={() => setSelected((current) => ({ ...current, [question.id]: option.label }))}
            >
              <span>{option.label}</span>
              <small>{option.description}</small>
            </button>
          ))}
        </div>
        {question.isOther && (
          <input
            value={notes[question.id] || ""}
            onChange={(event) => setNotes((current) => ({ ...current, [question.id]: event.target.value }))}
            placeholder="Optional note"
          />
        )}
      </div>
      {error && <p role="alert">{error}</p>}
      <div className="request-user-input-actions">
        {request.questions.length > 1 && (
          <button
            type="button"
            className="secondary"
            disabled={isFirst}
            onClick={() => setIndex((current) => Math.max(0, current - 1))}
          >
            Back
          </button>
        )}
        {!isLast ? (
          <button type="button" onClick={() => setIndex((current) => Math.min(request.questions.length - 1, current + 1))}>
            Next
          </button>
        ) : (
          <button type="button" onClick={submit} disabled={submitting}>
            Continue
          </button>
        )}
      </div>
    </section>
  );
}
