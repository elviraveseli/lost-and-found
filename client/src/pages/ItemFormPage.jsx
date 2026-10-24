import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { api } from '../api/client.js';
import { EmptyState, ErrorMessage, Field, Spinner } from '../components/ui.jsx';
import { CATEGORIES, toDateInput } from '../utils/format.js';

const MAX_IMAGE_MB = 5;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const EMPTY = { type: 'lost', title: '', description: '', category: '', date: toDateInput(), location: '' };

function validate(form) {
  const errors = {};
  if (form.title.trim().length < 3) errors.title = 'Title must be at least 3 characters';
  if (form.description.trim().length < 10) errors.description = 'Description must be at least 10 characters';
  if (!form.category) errors.category = 'Choose a category';
  if (!form.date) errors.date = 'Enter a date';
  else if (form.date > toDateInput()) errors.date = 'Date cannot be in the future';
  if (form.location.trim().length < 2) errors.location = 'Location must be at least 2 characters';
  return errors;
}

// Used for both "create" (/items/new) and "edit" (/items/:id/edit).
export function ItemFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [form, setForm] = useState(() => ({
    ...EMPTY,
    type: searchParams.get('type') === 'found' ? 'found' : 'lost',
  }));
  const [existingImage, setExistingImage] = useState(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(isEdit);
  const [submitting, setSubmitting] = useState(false);

  // When editing, load the current values.
  useEffect(() => {
    if (!isEdit) return;
    api(`/items/${id}`)
      .then(({ data }) => {
        if (!data.isOwner) throw Object.assign(new Error('You can only edit your own reports.'), { status: 403 });
        setForm({
          type: data.type,
          title: data.title,
          description: data.description,
          category: data.category,
          date: toDateInput(data.date),
          location: data.location,
        });
        setExistingImage(data.imageUrl);
      })
      .catch(setError)
      .finally(() => setLoading(false));
  }, [id, isEdit]);

  // Revoke object URLs so image previews do not leak memory.
  useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview]);

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  function onFile(e) {
    const selected = e.target.files?.[0];
    setErrors((prev) => ({ ...prev, image: undefined }));
    if (!selected) {
      setFile(null);
      setPreview(null);
      return;
    }
    if (!IMAGE_TYPES.includes(selected.type)) {
      setErrors((prev) => ({ ...prev, image: 'Only JPEG, PNG or WebP images are allowed' }));
      e.target.value = '';
      return;
    }
    if (selected.size > MAX_IMAGE_MB * 1024 * 1024) {
      setErrors((prev) => ({ ...prev, image: `Image must be smaller than ${MAX_IMAGE_MB} MB` }));
      e.target.value = '';
      return;
    }
    setFile(selected);
    setPreview(URL.createObjectURL(selected));
  }

  async function onSubmit(e) {
    e.preventDefault();
    const clientErrors = validate(form);
    setErrors(clientErrors);
    setError(null);
    if (Object.keys(clientErrors).length) return;

    const body = new FormData();
    for (const [key, value] of Object.entries(form)) body.append(key, typeof value === 'string' ? value.trim() : value);
    if (file) body.append('image', file);
    if (isEdit && removeImage && !file) body.append('removeImage', 'true');

    setSubmitting(true);
    try {
      const res = isEdit
        ? await api(`/items/${id}`, { method: 'PATCH', body })
        : await api('/items', { method: 'POST', body });
      navigate(`/items/${res.data.id}`);
    } catch (err) {
      setErrors(err.fieldErrors ?? {});
      setError(err);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <Spinner />;
  if (isEdit && error && !form.title) {
    return <EmptyState title="Cannot edit this report" action={<Link to="/dashboard">Back to dashboard</Link>}>{error.message}</EmptyState>;
  }

  const currentImage = preview ?? (!removeImage ? existingImage : null);

  return (
    <div className="form-page card">
      <h1>{isEdit ? 'Edit report' : 'Report an item'}</h1>
      <form onSubmit={onSubmit} noValidate>
        <fieldset className="segmented">
          <legend>What happened?</legend>
          {['lost', 'found'].map((t) => (
            <label key={t} className={form.type === t ? 'is-active' : ''}>
              <input type="radio" name="type" value={t} checked={form.type === t} onChange={set('type')} />
              {t === 'lost' ? 'I lost something' : 'I found something'}
            </label>
          ))}
        </fieldset>

        <Field label="Title" htmlFor="title" error={errors.title} hint="Short and specific, e.g. “Black leather wallet”">
          <input id="title" value={form.title} onChange={set('title')} maxLength={120} />
        </Field>

        <div className="form-row">
          <Field label="Category" htmlFor="category" error={errors.category}>
            <select id="category" value={form.category} onChange={set('category')}>
              <option value="">Choose…</option>
              {Object.entries(CATEGORIES).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label={form.type === 'lost' ? 'Date lost' : 'Date found'} htmlFor="date" error={errors.date}>
            <input id="date" type="date" max={toDateInput()} value={form.date} onChange={set('date')} />
          </Field>
        </div>

        <Field
          label="Approximate location"
          htmlFor="location"
          error={errors.location}
          hint="Keep it approximate (e.g. “Central Station”). Do not include your home address."
        >
          <input id="location" value={form.location} onChange={set('location')} maxLength={120} />
        </Field>

        <Field
          label="Description"
          htmlFor="description"
          error={errors.description}
          hint={
            form.type === 'found'
              ? 'Describe it, but keep back one or two details so you can verify claims.'
              : 'Colour, brand, marks, contents…'
          }
        >
          <textarea id="description" rows={5} value={form.description} onChange={set('description')} maxLength={2000} />
        </Field>

        <Field label="Photo (optional)" htmlFor="image" error={errors.image} hint={`JPEG, PNG or WebP, up to ${MAX_IMAGE_MB} MB. Avoid photos showing personal data such as ID cards.`}>
          <input id="image" type="file" accept={IMAGE_TYPES.join(',')} onChange={onFile} />
        </Field>
        {currentImage && <img src={currentImage} alt="Preview" className="image-preview" />}
        {isEdit && existingImage && !file && (
          <label className="checkbox">
            <input type="checkbox" checked={removeImage} onChange={(e) => setRemoveImage(e.target.checked)} /> Remove
            current photo
          </label>
        )}

        {error && error.code !== 'VALIDATION_ERROR' && <ErrorMessage error={error} />}
        {error?.code === 'VALIDATION_ERROR' && <ErrorMessage error={{ message: 'Please fix the highlighted fields.' }} />}

        <div className="actions">
          <button type="submit" className="btn btn--primary" disabled={submitting}>
            {submitting ? 'Saving…' : isEdit ? 'Save changes' : 'Publish report'}
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => navigate(-1)}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
