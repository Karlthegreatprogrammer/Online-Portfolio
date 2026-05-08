/* ============================================================
   BRKB Digital Solutions — Form Handler
   - Client-side validation
   - Submit state (loading / success / error)
   - AJAX submission via FormSubmit (no backend required)
   ============================================================ */

'use strict';

/* ── Validation Helpers ───────────────────────────────────── */
const validators = {
  required: (val) => val.trim() !== '',
  email:    (val) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val.trim()),
  minLen:   (val, n) => val.trim().length >= n,
};

function getError(name, value) {
  switch (name) {
    case 'name':
      if (!validators.required(value)) return 'Please enter your name.';
      if (!validators.minLen(value, 2)) return 'Name must be at least 2 characters.';
      return null;
    case 'email':
      if (!validators.required(value)) return 'Please enter your email address.';
      if (!validators.email(value)) return 'Please enter a valid email address.';
      return null;
    case 'message':
      if (!validators.required(value)) return 'Please enter a message.';
      if (!validators.minLen(value, 10)) return 'Message must be at least 10 characters.';
      return null;
    default:
      return null;
  }
}

/* ── Field UI Helpers ─────────────────────────────────────── */
function setFieldError(input, message) {
  input.style.borderColor = '#EF4444';
  input.style.boxShadow   = '0 0 0 3px rgba(239,68,68,0.1)';

  let errorEl = input.parentElement.querySelector('.field-error');
  if (!errorEl) {
    errorEl = document.createElement('p');
    errorEl.className = 'field-error';
    errorEl.style.cssText = 'margin-top:4px; font-size:0.75rem; color:#EF4444;';
    input.parentElement.appendChild(errorEl);
  }
  errorEl.textContent = message;
}

function clearFieldError(input) {
  input.style.borderColor = '';
  input.style.boxShadow   = '';
  const errorEl = input.parentElement.querySelector('.field-error');
  if (errorEl) errorEl.remove();
}

/* ── Submit Button State ──────────────────────────────────── */
function setSubmitState(btn, state) {
  const states = {
    idle:    { text: 'Send Message →',    disabled: false },
    loading: { text: 'Sending…',          disabled: true  },
    success: { text: '✓ Message Sent!',   disabled: true  },
    error:   { text: 'Try Again →',       disabled: false },
  };

  const { text, disabled } = states[state] || states.idle;
  btn.textContent = text;
  btn.disabled    = disabled;
  btn.style.opacity = disabled ? '0.7' : '1';
}

/* ── Show Form Feedback Banner ────────────────────────────── */
function showFormBanner(form, type, message) {
  let banner = form.querySelector('.form-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.className = 'form-banner';
    banner.style.cssText = `
      padding: 0.85rem 1.25rem;
      border-radius: 8px;
      font-size: 0.875rem;
      font-weight: 500;
      margin-bottom: 1rem;
      border: 1px solid;
      transition: opacity 0.3s ease;
    `;
    form.insertBefore(banner, form.firstChild);
  }

  if (type === 'success') {
    banner.style.background    = 'rgba(74,222,128,0.08)';
    banner.style.borderColor   = 'rgba(74,222,128,0.3)';
    banner.style.color         = '#4ADE80';
  } else {
    banner.style.background    = 'rgba(239,68,68,0.08)';
    banner.style.borderColor   = 'rgba(239,68,68,0.3)';
    banner.style.color         = '#EF4444';
  }

  banner.textContent = message;
  banner.style.display = 'block';
}

/* ── Send to FormSubmit via AJAX ──────────────────────────── */
async function sendToFormSubmit(data) {
  const endpoint = 'https://formsubmit.co/ajax/contact.brkbdevs@gmail.com';
  
  // Add some metadata for the email formatting
  const payload = {
    ...data,
    _subject: `[BRKB Inquiry] ${data.service || 'New Project'} — ${data.name}`,
    _template: 'box' // Uses a clean email template
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error('Form submission failed');
  }

  return response.json();
}

/* ── Main Form Init ───────────────────────────────────────── */
function initForm(formId) {
  const form = document.getElementById(formId);
  if (!form) return;

  const fields = ['name', 'email', 'message'];

  /* Live validation on blur */
  fields.forEach(name => {
    const input = form.querySelector(`[name="${name}"]`);
    if (!input) return;

    input.addEventListener('blur', () => {
      const err = getError(name, input.value);
      err ? setFieldError(input, err) : clearFieldError(input);
    });

    input.addEventListener('input', () => {
      if (input.style.borderColor === 'rgb(239, 68, 68)') {
        const err = getError(name, input.value);
        err ? setFieldError(input, err) : clearFieldError(input);
      }
    });
  });

  /* Submit handler */
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const submitBtn = form.querySelector('[type="submit"]');
    let hasErrors = false;

    // Validate all fields
    fields.forEach(name => {
      const input = form.querySelector(`[name="${name}"]`);
      if (!input) return;
      const err = getError(name, input.value);
      if (err) {
        setFieldError(input, err);
        hasErrors = true;
      } else {
        clearFieldError(input);
      }
    });

    if (hasErrors) return;

    // Collect data
    const data = {
      name:    form.querySelector('[name="name"]')?.value.trim()    || '',
      email:   form.querySelector('[name="email"]')?.value.trim()   || '',
      phone:   form.querySelector('[name="phone"]')?.value.trim()   || 'Not provided',
      budget:  form.querySelector('[name="budget"]')?.value         || 'Not specified',
      service: form.querySelector('[name="service"]')?.value        || 'Not specified',
      message: form.querySelector('[name="message"]')?.value.trim() || '',
    };

    setSubmitState(submitBtn, 'loading');

    try {
      // Send data to FormSubmit
      await sendToFormSubmit(data);

      setSubmitState(submitBtn, 'success');
      showFormBanner(form, 'success', '✓ Message sent successfully! We will get back to you within 24 hours.');
      form.reset();

      // Reset button and hide banner after 5s
      setTimeout(() => {
        setSubmitState(submitBtn, 'idle');
        const banner = form.querySelector('.form-banner');
        if (banner) banner.style.display = 'none';
      }, 5000);

    } catch (err) {
      console.error('[BRKB] Form error:', err);
      setSubmitState(submitBtn, 'error');
      showFormBanner(form, 'error', 'Something went wrong. Please email us directly at contact.brkbdevs@gmail.com');
    }
  });
}

/* ── Init on DOM Ready ────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  initForm('contact-form');
});
