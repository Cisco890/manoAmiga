import { useState, type FormEvent } from 'react';
import { X } from 'lucide-react';
import type { Enrollment } from '../../api/school.ts';
import { ApiError } from '../../auth/api.ts';
import modalStyles from './FormModal.module.css';

export type ReviewDecision = 'INCOMPLETE' | 'REJECTED';

const minReasonLength = 5;
const maxReasonLength = 1000;

const copy: Record<ReviewDecision, { title: string; description: string; submit: string }> = {
  INCOMPLETE: {
    title: 'Devolver para corrección',
    description:
      'La inscripción pasará a Incompleta. La secretaría verá el motivo, corregirá los datos y la enviará de nuevo a revisión.',
    submit: 'Devolver inscripción',
  },
  REJECTED: {
    title: 'Rechazar definitivamente',
    description:
      'La inscripción pasará a Rechazada y no podrá volver a revisión. Use esta opción solo cuando el ingreso no procede.',
    submit: 'Rechazar inscripción',
  },
};

type ReviewDecisionModalProps = {
  enrollment: Enrollment;
  decision: ReviewDecision;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
};

export function ReviewDecisionModal({ enrollment, decision, onClose, onConfirm }: ReviewDecisionModalProps) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const text = copy[decision];
  const trimmedLength = reason.trim().length;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (trimmedLength < minReasonLength) {
      setError(`Escriba el motivo (mínimo ${minReasonLength} caracteres).`);
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onConfirm(reason.trim());
    } catch (saveError) {
      setError(saveError instanceof ApiError ? saveError.message : 'No se pudo registrar la decisión.');
      setSaving(false);
    }
  }

  return (
    <div className={modalStyles.overlay}>
      <button type="button" className={modalStyles.backdrop} onClick={onClose} aria-label="Cerrar" />
      <div className={modalStyles.modal} role="dialog" aria-modal="true" aria-labelledby="review-decision-title">
        <div className={modalStyles.header}>
          <div>
            <h2 id="review-decision-title">{text.title}</h2>
            <p>
              {enrollment.student.fullName} · {enrollment.grade.name} · {enrollment.academicCycle.name}
            </p>
          </div>
          <button type="button" className={modalStyles.close} onClick={onClose} aria-label="Cerrar formulario">
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <form className={modalStyles.form} onSubmit={(event) => void handleSubmit(event)} noValidate>
          <p>{text.description}</p>
          {error ? (
            <p className={modalStyles.error} role="alert">
              {error}
            </p>
          ) : null}
          <label className="label">
            Motivo
            <textarea
              className="field fieldWide"
              rows={4}
              value={reason}
              maxLength={maxReasonLength}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Explique qué falta o por qué no procede la inscripción"
              disabled={saving}
              required
            />
          </label>
          <small>
            {trimmedLength}/{maxReasonLength} caracteres
          </small>
          <div className={modalStyles.actions}>
            <button type="button" className="btn" onClick={onClose} disabled={saving}>
              Cancelar
            </button>
            <button type="submit" className="btn btnPrimary" disabled={saving}>
              {saving ? 'Guardando…' : text.submit}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
