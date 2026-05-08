/* ============================================================
   BRKB Digital Solutions — Global Script
   - Component injection (navbar + footer)
   - Navbar scroll behavior
   - Mobile hamburger menu
   - Active nav link detection
   - IntersectionObserver scroll reveals
   - Footer year
   ============================================================ */

'use strict';

/* ── Component Loader ─────────────────────────────────────── */
async function loadComponent(selector, filePath) {
  const el = document.querySelector(selector);
  if (!el) return;
  try {
    const res = await fetch(filePath + '?v=23');
    if (!res.ok) throw new Error(`Failed to load ${filePath}`);
    el.innerHTML = await res.text();
  } catch (err) {
    console.warn('[BRKB] Component load error:', err);
  }
}

async function initComponents() {
  await loadComponent('#navbar-placeholder', 'components/navbar.html');
  await loadComponent('#footer-placeholder', 'components/footer.html');

  // Run init after components are injected into DOM
  initNavbar();
  initThemeToggle();
  initActiveLinks();
  setFooterYear();

  // Hide loader smoothly
  const loader = document.getElementById('global-loader');
  if (loader) {
    setTimeout(() => {
      loader.classList.add('hidden');
      setTimeout(() => loader.remove(), 600);
    }, 250);
  }
}

/* ── Navbar Scroll Behavior ───────────────────────────────── */
function initNavbar() {
  const navbar = document.getElementById('navbar');
  if (!navbar) return;

  const onScroll = () => {
    if (window.scrollY > 60) {
      navbar.classList.add('scrolled');
    } else {
      navbar.classList.remove('scrolled');
    }
  };

  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll(); // run on load

  /* ── Hamburger Menu ── */
  const hamburger = document.getElementById('navbar-hamburger');
  const mobileMenu = document.getElementById('navbar-mobile');

  if (!hamburger || !mobileMenu) return;

  const toggleMenu = (open) => {
    hamburger.classList.toggle('open', open);
    mobileMenu.classList.toggle('open', open);
    hamburger.setAttribute('aria-expanded', String(open));
    document.body.style.overflow = open ? 'hidden' : '';
  };

  hamburger.addEventListener('click', () => {
    const isOpen = hamburger.classList.contains('open');
    toggleMenu(!isOpen);
  });

  // Close on mobile link click
  mobileMenu.querySelectorAll('.navbar-mobile-link').forEach(link => {
    link.addEventListener('click', () => toggleMenu(false));
  });

  // Close on outside click
  document.addEventListener('click', (e) => {
    if (
      hamburger.classList.contains('open') &&
      !hamburger.contains(e.target) &&
      !mobileMenu.contains(e.target)
    ) {
      toggleMenu(false);
    }
  });

  // Close on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && hamburger.classList.contains('open')) {
      toggleMenu(false);
      hamburger.focus();
    }
  });
}

/* ── Theme Toggle ─────────────────────────────────────────── */
function initThemeToggle() {
  const toggleBtn = document.getElementById('theme-toggle');
  if (!toggleBtn) return;

  // Initialize theme from local storage or system preference
  const currentTheme = localStorage.getItem('theme') || 
    (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  
  if (currentTheme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  }

  toggleBtn.addEventListener('click', () => {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const newTheme = isDark ? 'light' : 'dark';
    
    if (newTheme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
    
    localStorage.setItem('theme', newTheme);
  });
}

/* ── Active Nav Link ──────────────────────────────────────── */
function initActiveLinks() {
  const currentFile = (window.location.pathname.split('/').pop() || 'index.html').toLowerCase();

  document.querySelectorAll('[data-navlink]').forEach(link => {
    const href = link.getAttribute('href') || '';
    const linkFile = (href.split('/').pop() || 'index.html').toLowerCase();

    if (currentFile === linkFile) {
      link.classList.add('active');
    }
  });
}

/* ── Footer Year ──────────────────────────────────────────── */
function setFooterYear() {
  const yearEl = document.getElementById('footer-year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();
}

/* ── Scroll Reveal (IntersectionObserver) ─────────────────── */
function initScrollReveal() {
  const revealClasses = ['.reveal', '.reveal-left', '.reveal-right', '.reveal-scale'];
  const elements = document.querySelectorAll(revealClasses.join(', '));

  if (!elements.length) return;

  // Respect reduced motion preference
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    elements.forEach(el => el.classList.add('revealed'));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('revealed');
          observer.unobserve(entry.target); // animate once
        }
      });
    },
    {
      threshold: 0.12,
      rootMargin: '0px 0px -40px 0px',
    }
  );

  elements.forEach(el => observer.observe(el));
}

/* ── FAQ Accordion ────────────────────────────────────────── */
function initFAQ() {
  const faqItems = document.querySelectorAll('.faq-item');
  if (!faqItems.length) return;

  faqItems.forEach(item => {
    const btn = item.querySelector('.faq-question');
    if (!btn) return;

    btn.addEventListener('click', () => {
      const isOpen = item.classList.contains('open');

      // Close all
      faqItems.forEach(i => {
        i.classList.remove('open');
        const q = i.querySelector('.faq-question');
        if (q) q.setAttribute('aria-expanded', 'false');
      });

      // Open clicked (if it was closed)
      if (!isOpen) {
        item.classList.add('open');
        btn.setAttribute('aria-expanded', 'true');
      }
    });
  });
}

/* ── Smooth Scroll for anchor links ──────────────────────── */
function initSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', (e) => {
      const target = document.querySelector(anchor.getAttribute('href'));
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
}

/* ── Typewriter Effect ────────────────────────────────────── */
function initTypewriter() {
  const el = document.getElementById('typewriter-text');
  if (!el) return;

  const words = ['Experiences That Convert.', 'Brands That Stand Out.', 'Websites That Perform.'];
  let wordIndex = 0;
  let charIndex = 0;
  let isDeleting = false;
  let isWaiting = false;

  function type() {
    const currentWord = words[wordIndex];
    
    if (isDeleting) {
      el.textContent = currentWord.substring(0, charIndex - 1);
      charIndex--;
    } else {
      el.textContent = currentWord.substring(0, charIndex + 1);
      charIndex++;
    }

    let typeSpeed = isDeleting ? 40 : 80;

    if (!isDeleting && charIndex === currentWord.length) {
      isWaiting = true;
      typeSpeed = 2500; // wait at the end of word
      isDeleting = true;
    } else if (isDeleting && charIndex === 0) {
      isDeleting = false;
      wordIndex = (wordIndex + 1) % words.length;
      typeSpeed = 500; // wait before typing new word
    }

    setTimeout(type, typeSpeed);
  }

  // start effect
  setTimeout(type, 1000);
}

/* ── Process Animation ──────────────────────────────────────── */
function initProcessAnimation() {
  const steps = document.querySelectorAll('.process-step');
  const container = document.querySelector('.process-steps');
  if (!steps.length || !container) return;

  let currentStep = 0;
  
  function updateStep() {
    // Remove active from all
    steps.forEach(step => step.classList.remove('active'));
    // Add active to current
    steps[currentStep].classList.add('active');
    
    // Update progress line width (0 to 1)
    const progress = currentStep / (steps.length - 1);
    container.style.setProperty('--progress', progress);
  }

  // Highlight the first step initially
  updateStep();

  setInterval(() => {
    currentStep = (currentStep + 1) % steps.length;
    updateStep();
  }, 1500); // 1.5 seconds per step
}

/* ── Chatbot Logic ──────────────────────────────────────────── */
function initChatbot() {
  const toggleBtn = document.getElementById('chat-toggle-btn');
  const chatWindow = document.getElementById('chat-window');
  const closeBtn = document.getElementById('chat-close-btn');
  const sendBtn = document.getElementById('chat-send-btn');
  const chatInput = document.getElementById('chat-input');
  const chatBody = document.getElementById('chat-body');

  if (!toggleBtn || !chatWindow) return;

  // Toggle chat window
  toggleBtn.addEventListener('click', () => {
    chatWindow.classList.toggle('open');
    if (chatWindow.classList.contains('open')) {
      chatInput.focus();
    }
  });

  closeBtn.addEventListener('click', () => {
    chatWindow.classList.remove('open');
  });

  // Chat state
  let messages = [];
  let isWaiting = false;

  function addMessageToUI(content, isUser) {
    const msgDiv = document.createElement('div');
    msgDiv.className = `chat-message ${isUser ? 'user-message' : 'bot-message'}`;
    msgDiv.innerHTML = `<div class="message-bubble">${content.replace(/\n/g, '<br>')}</div>`;
    chatBody.appendChild(msgDiv);
    chatBody.scrollTop = chatBody.scrollHeight;
  }

  function showTyping() {
    const typingDiv = document.createElement('div');
    typingDiv.className = 'typing-indicator';
    typingDiv.id = 'typing-indicator';
    typingDiv.innerHTML = '<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>';
    chatBody.appendChild(typingDiv);
    chatBody.scrollTop = chatBody.scrollHeight;
  }

  function removeTyping() {
    const typingDiv = document.getElementById('typing-indicator');
    if (typingDiv) typingDiv.remove();
  }

  async function sendMessage() {
    const text = chatInput.value.trim();
    if (!text || isWaiting) return;

    // Add user message
    addMessageToUI(text, true);
    messages.push({ role: 'user', content: text });
    
    chatInput.value = '';
    isWaiting = true;
    sendBtn.disabled = true;
    showTyping();

    try {
      // Call the serverless function
      const response = await fetch('/.netlify/functions/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages })
      });

      removeTyping();

      const data = await response.json();

      if (!response.ok) {
        const errMsg = data?.error || `Server error (${response.status})`;
        addMessageToUI(`Error: ${errMsg}`, false);
      } else if (data.error) {
        addMessageToUI(`Error: ${data.error}`, false);
      } else {
        const botReply = data.choices[0].message.content;
        addMessageToUI(botReply, false);
        messages.push({ role: 'assistant', content: botReply });
      }

    } catch (error) {
      removeTyping();
      console.error('Chat Error:', error);
      addMessageToUI(`Network error: ${error.message}. The function may not be deployed.`, false);
    } finally {
      isWaiting = false;
      sendBtn.disabled = false;
      chatInput.focus();
    }
  }

  sendBtn.addEventListener('click', sendMessage);
  chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
  });
}

/* ── Init ─────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  initComponents().then(() => {
    // We wait for components to load before initializing chat since it is injected from footer.html
    initChatbot();
  });
  initScrollReveal();
  initFAQ();
  initSmoothScroll();
  initTypewriter();
  initProcessAnimation();
});
