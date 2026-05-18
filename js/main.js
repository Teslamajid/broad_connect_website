/* =============================================
   BroadConnect - Main JavaScript
   Modular, clean, production-ready
   ============================================= */

'use strict';

/* ----- Component Loader ----- */
const ComponentLoader = {
    async load(elementId, componentPath) {
        const element = document.getElementById(elementId);
        if (!element) return;

        try {
            const response = await fetch(componentPath);
            if (!response.ok) throw new Error(`Failed to load ${componentPath}`);
            const html = await response.text();
            element.innerHTML = html;
            return true;
        } catch (error) {
            console.error(`Component load error: ${error.message}`);
            return false;
        }
    },

    async loadAll(components) {
        const loadPromises = components.map(({ id, path }) => 
            this.load(id, path)
        );
        await Promise.all(loadPromises);
        // Initialize features after components load
        App.init();
    }
};

/* ----- Mobile Navigation ----- */
const MobileNav = {
    init() {
        this.menuBtn = document.getElementById('mobileMenuBtn');
        this.mobileNav = document.getElementById('mobileNav');
        this.navLinks = document.getElementById('navLinks');
        
        if (!this.menuBtn) return;

        this.menuBtn.addEventListener('click', () => this.toggle());
        
        // Close menu when clicking nav links
        document.querySelectorAll('.mobile-nav-links a').forEach(link => {
            link.addEventListener('click', () => this.close());
        });

        // Close menu on escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') this.close();
        });
    },

    toggle() {
        const isOpen = this.mobileNav.classList.toggle('active');
        this.menuBtn.classList.toggle('active');
        this.menuBtn.setAttribute('aria-expanded', isOpen);
        this.mobileNav.setAttribute('aria-hidden', !isOpen);
        document.body.style.overflow = isOpen ? 'hidden' : '';
    },

    close() {
        this.mobileNav.classList.remove('active');
        this.menuBtn.classList.remove('active');
        this.menuBtn.setAttribute('aria-expanded', 'false');
        this.mobileNav.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
    }
};

/* ----- Header Scroll Effect ----- */
const HeaderScroll = {
    init() {
        this.header = document.querySelector('.header');
        if (!this.header) return;

        let lastScroll = 0;
        
        window.addEventListener('scroll', () => {
            const currentScroll = window.scrollY;
            
            // Add shadow on scroll
            if (currentScroll > 50) {
                this.header.classList.add('scrolled');
            } else {
                this.header.classList.remove('scrolled');
            }
            
            lastScroll = currentScroll;
        }, { passive: true });
    }
};

/* ----- Smooth Scroll ----- */
const SmoothScroll = {
    init() {
        document.querySelectorAll('a[href^="#"]').forEach(anchor => {
            anchor.addEventListener('click', (e) => {
                const href = anchor.getAttribute('href');
                if (href === '#') return;
                
                const target = document.querySelector(href);
                if (target) {
                    e.preventDefault();
                    const headerHeight = document.querySelector('.header')?.offsetHeight || 72;
                    const targetPosition = target.offsetTop - headerHeight;
                    
                    window.scrollTo({
                        top: targetPosition,
                        behavior: 'smooth'
                    });
                    
                    // Close mobile nav if open
                    MobileNav.close();
                }
            });
        });
    }
};

/* ----- Coverage Form ----- */
const CoverageForm = {
    init() {
        this.form = document.getElementById('coverageForm');
        this.input = document.getElementById('addressInput');
        this.result = document.getElementById('coverageResult');
        
        if (!this.form) return;

        this.form.addEventListener('submit', (e) => this.handleSubmit(e));
    },

    handleSubmit(e) {
        e.preventDefault();
        const address = this.input.value.trim();
        
        if (!address) {
            this.input.focus();
            return;
        }

        // Show loading state
        const btn = this.form.querySelector('button');
        btn.classList.add('is-loading');
        btn.disabled = true;
        
        if (this.result) {
            this.result.innerHTML = '';
            this.result.className = 'coverage-result is-loading';
            this.result.style.display = 'flex';
        }

        // Simulate API call with random result for demo
        setTimeout(() => {
            const isAvailable = Math.random() > 0.2; // 80% chance available
            this.showResult(address, isAvailable);
            btn.classList.remove('is-loading');
            btn.disabled = false;
            if (isAvailable) this.input.value = '';
        }, 1200);
    },

    showResult(address, isAvailable) {
        if (this.result) {
            this.result.className = 'coverage-result';
            this.result.setAttribute('role', 'alert');
            
            if (isAvailable) {
                this.result.innerHTML = `
                    <div class="coverage-success">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                        <div>
                            <p><strong>Great news!</strong> BroadConnect services are available at <em>${address}</em>.</p>
                            <p style="margin-top: 8px; font-size: 0.938rem;">Our team will contact you shortly to discuss installation options.</p>
                        </div>
                    </div>
                `;
            } else {
                this.result.innerHTML = `
                    <div class="coverage-error">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                        <div>
                            <p><strong>Not yet available</strong></p>
                            <p style="margin-top: 4px; font-size: 0.938rem;">We're expanding rapidly! Enter your email to be notified when we reach your area.</p>
                        </div>
                    </div>
                `;
            }
            this.result.style.display = 'block';
        }
    }
};

/* ----- Contact Form ----- */
const ContactForm = {
    init() {
        this.form = document.getElementById('contactForm');
        if (!this.form) return;

        this.form.addEventListener('submit', (e) => this.handleSubmit(e));
    },

    handleSubmit(e) {
        e.preventDefault();
        
        // Validate form first
        if (!FormValidation.validateForm(this.form)) {
            // Focus on first error field
            const firstError = this.form.querySelector('.has-error input, .has-error select, .has-error textarea');
            if (firstError) firstError.focus();
            return;
        }
        
        const formData = new FormData(this.form);
        const data = Object.fromEntries(formData);
        
        // Show loading
        const btn = this.form.querySelector('button[type="submit"]');
        const originalText = btn.textContent;
        btn.classList.add('is-loading');
        btn.disabled = true;

        // Simulate form submission
        setTimeout(() => {
            this.showSuccess();
            btn.classList.remove('is-loading');
            btn.textContent = originalText;
            btn.disabled = false;
            this.form.reset();
            // Clear success states
            this.form.querySelectorAll('.has-success').forEach(el => el.classList.remove('has-success'));
        }, 1500);
    },

    showSuccess() {
        const successMsg = document.createElement('div');
        successMsg.className = 'form-success';
        successMsg.setAttribute('role', 'alert');
        successMsg.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
            <p>Thank you! Your message has been sent. We'll get back to you soon.</p>
        `;
        this.form.parentNode.insertBefore(successMsg, this.form.nextSibling);
        
        setTimeout(() => successMsg.remove(), 5000);
    }
};

/* ----- Dynamic Year ----- */
const DynamicYear = {
    init() {
        const yearSpan = document.getElementById('currentYear');
        if (yearSpan) {
            yearSpan.textContent = new Date().getFullYear();
        }
    }
};

/* ----- Animations (GSAP) ----- */
const Animations = {
    prefersReducedMotion: false,

    init() {
        // Check for reduced motion preference
        this.prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        
        if (this.prefersReducedMotion) {
            // Skip animations for users who prefer reduced motion
            return;
        }

        if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') return;

        gsap.registerPlugin(ScrollTrigger);

        // Set defaults for smoother animations
        gsap.defaults({
            ease: 'power3.out',
            duration: 0.8
        });

        this.initHeroAnimations();
        this.initPageHeroAnimations();
        this.initScrollAnimations();
        this.initCardAnimations();
        this.initBreadcrumbAnimation();
    },

    initHeroAnimations() {
        const heroTitle = document.querySelector('.hero-title');
        const heroSubtitle = document.querySelector('.hero-subtitle');
        const heroBtn = document.querySelector('.hero .btn');

        if (heroTitle) {
            const tl = gsap.timeline();
            
            tl.from(heroTitle, {
                y: 50,
                opacity: 0,
                duration: 1
            })
            .from(heroSubtitle, {
                y: 40,
                opacity: 0,
                duration: 0.9
            }, '-=0.6')
            .from(heroBtn, {
                y: 30,
                opacity: 0,
                duration: 0.8
            }, '-=0.5');
        }
    },

    initPageHeroAnimations() {
        const pageHeroTitle = document.querySelector('.page-hero-title');
        const pageHeroSubtitle = document.querySelector('.page-hero-subtitle');

        if (pageHeroTitle) {
            const tl = gsap.timeline();
            
            tl.from(pageHeroTitle, {
                y: 40,
                opacity: 0,
                duration: 0.9
            })
            .from(pageHeroSubtitle, {
                y: 30,
                opacity: 0,
                duration: 0.8
            }, '-=0.5');
        }
    },

    initScrollAnimations() {
        // Section titles with subtitles
        gsap.utils.toArray('.section-title').forEach(title => {
            const subtitle = title.nextElementSibling?.classList.contains('section-subtitle') 
                ? title.nextElementSibling 
                : null;

            gsap.from(title, {
                scrollTrigger: {
                    trigger: title,
                    start: 'top 85%',
                    toggleActions: 'play none none none'
                },
                y: 30,
                opacity: 0,
                duration: 0.7
            });

            if (subtitle) {
                gsap.from(subtitle, {
                    scrollTrigger: {
                        trigger: subtitle,
                        start: 'top 85%',
                        toggleActions: 'play none none none'
                    },
                    y: 25,
                    opacity: 0,
                    duration: 0.7,
                    delay: 0.1
                });
            }
        });

        // Content blocks
        gsap.utils.toArray('.content-block').forEach(block => {
            gsap.from(block, {
                scrollTrigger: {
                    trigger: block,
                    start: 'top 80%',
                    toggleActions: 'play none none none'
                },
                y: 30,
                opacity: 0,
                duration: 0.8
            });
        });

        // Steps grid
        gsap.utils.toArray('.step-card').forEach((step, index) => {
            gsap.from(step, {
                scrollTrigger: {
                    trigger: step,
                    start: 'top 85%',
                    toggleActions: 'play none none none'
                },
                y: 40,
                opacity: 0,
                duration: 0.6,
                delay: index * 0.1
            });
        });
    },

    initCardAnimations() {
        const cardGroups = [
            { selector: '.plan-card', trigger: '.plans-grid' },
            { selector: '.feature-card', trigger: '.features-grid' },
            { selector: '.service-card', trigger: '.services-grid' },
            { selector: '.testimonial-card', trigger: '.testimonials-grid' },
            { selector: '.hub-card', trigger: '.hub-grid' },
            { selector: '.pricing-card', trigger: '.pricing-grid' },
            { selector: '.visual-card', trigger: '.page-visual-grid' }
        ];

        cardGroups.forEach(({ selector, trigger }) => {
            const triggerEl = document.querySelector(trigger);
            const cards = document.querySelectorAll(selector);
            
            if (!triggerEl || cards.length === 0) return;

            gsap.from(cards, {
                scrollTrigger: {
                    trigger: triggerEl,
                    start: 'top 80%',
                    toggleActions: 'play none none none'
                },
                y: 50,
                opacity: 0,
                duration: 0.6,
                stagger: {
                    amount: 0.4,
                    from: 'start'
                }
            });
        });
    },

    initBreadcrumbAnimation() {
        const breadcrumb = document.querySelector('.breadcrumb');
        if (breadcrumb) {
            gsap.from(breadcrumb, {
                opacity: 0,
                y: -10,
                duration: 0.5,
                delay: 0.3
            });
        }
    }
};


/* ----- Breadcrumb Renderer ----- */
const Breadcrumb = {
    init() {
        const list = document.getElementById('breadcrumbList');
        if (!list) return;

        const data = window.pageData;
        if (!data || !data.breadcrumbs || !data.breadcrumbs.length) return;

        list.innerHTML = data.breadcrumbs.map((crumb, index) => {
            const isLast = index === data.breadcrumbs.length - 1;
            if (isLast || !crumb.url) {
                return `<li class="breadcrumb-item active" aria-current="page">${crumb.label}</li>`;
            }
            return `<li class="breadcrumb-item"><a href="${crumb.url}">${crumb.label}</a></li>`;
        }).join('');
    }
};

/* ----- Mobile Dropdown ----- */
const MobileDropdown = {
    init() {
        document.querySelectorAll('.mobile-dropdown-toggle').forEach(btn => {
            btn.addEventListener('click', () => {
                const submenu = btn.nextElementSibling;
                if (!submenu) return;
                const isOpen = submenu.classList.toggle('active');
                btn.setAttribute('aria-expanded', String(isOpen));
                // Close other open menus
                document.querySelectorAll('.mobile-dropdown-menu.active').forEach(menu => {
                    if (menu !== submenu) {
                        menu.classList.remove('active');
                        const siblingBtn = menu.previousElementSibling;
                        if (siblingBtn) siblingBtn.setAttribute('aria-expanded', 'false');
                    }
                });
            });
        });
    }
};

/* ----- Desktop Dropdown Keyboard Navigation ----- */
const DropdownKeyboard = {
    init() {
        document.querySelectorAll('.nav-dropdown').forEach(dropdown => {
            const toggle = dropdown.querySelector('.nav-dropdown-toggle');
            const menu = dropdown.querySelector('.dropdown-menu');
            if (!toggle || !menu) return;

            const menuItems = menu.querySelectorAll('a');
            let currentIndex = -1;

            // Handle keyboard navigation on the toggle
            toggle.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    this.openMenu(dropdown, menu, menuItems);
                    currentIndex = 0;
                    menuItems[0]?.focus();
                }
                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    this.openMenu(dropdown, menu, menuItems);
                    currentIndex = 0;
                    menuItems[0]?.focus();
                }
            });

            // Handle keyboard navigation within the menu
            menu.addEventListener('keydown', (e) => {
                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    currentIndex = (currentIndex + 1) % menuItems.length;
                    menuItems[currentIndex]?.focus();
                }
                if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    currentIndex = (currentIndex - 1 + menuItems.length) % menuItems.length;
                    menuItems[currentIndex]?.focus();
                }
                if (e.key === 'Escape') {
                    this.closeMenu(dropdown, menu);
                    toggle.focus();
                    currentIndex = -1;
                }
                if (e.key === 'Tab') {
                    this.closeMenu(dropdown, menu);
                    currentIndex = -1;
                }
            });

            // Close when clicking outside
            document.addEventListener('click', (e) => {
                if (!dropdown.contains(e.target)) {
                    this.closeMenu(dropdown, menu);
                    currentIndex = -1;
                }
            });
        });
    },

    openMenu(dropdown, menu) {
        dropdown.classList.add('dropdown-open');
        menu.style.display = 'block';
    },

    closeMenu(dropdown, menu) {
        dropdown.classList.remove('dropdown-open');
        menu.style.display = '';
    }
};

/* ----- Active Navigation State ----- */
const ActiveNav = {
    init() {
        const currentPath = window.location.pathname;
        
        // Desktop navigation
        document.querySelectorAll('.nav-links a').forEach(link => {
            const href = link.getAttribute('href');
            if (this.isActive(href, currentPath)) {
                link.classList.add('nav-active');
                // Also highlight parent dropdown toggle if applicable
                const parent = link.closest('.nav-dropdown');
                if (parent) {
                    const toggle = parent.querySelector('.nav-dropdown-toggle');
                    if (toggle && toggle !== link) {
                        toggle.classList.add('nav-active');
                    }
                }
            }
        });

        // Mobile navigation
        document.querySelectorAll('.mobile-nav-links a').forEach(link => {
            const href = link.getAttribute('href');
            if (this.isActive(href, currentPath)) {
                link.classList.add('nav-active');
            }
        });

        document.querySelectorAll('.mobile-dropdown-toggle').forEach(btn => {
            const submenu = btn.nextElementSibling;
            if (submenu) {
                const hasActiveChild = submenu.querySelector('.nav-active');
                if (hasActiveChild) {
                    btn.classList.add('nav-active');
                }
            }
        });
    },

    isActive(href, currentPath) {
        if (!href || href === '#' || href.startsWith('/#')) return false;
        
        // Normalize paths
        const normalizedHref = href.replace(/\/index\.html$/, '/').replace(/\/$/, '') || '/';
        const normalizedPath = currentPath.replace(/\/index\.html$/, '/').replace(/\/$/, '') || '/';
        
        // Exact match
        if (normalizedHref === normalizedPath) return true;
        
        // Parent path match (e.g., /your-home/ is active when on /your-home/fiber-to-the-home-ftth/)
        if (normalizedPath.startsWith(normalizedHref + '/') && normalizedHref !== '') return true;
        
        return false;
    }
};

/* ----- Enhanced Form Validation ----- */
const FormValidation = {
    init() {
        this.initContactForm();
        this.initCoverageForm();
    },

    initContactForm() {
        const form = document.getElementById('contactForm');
        if (!form) return;

        const inputs = form.querySelectorAll('input, select, textarea');
        
        inputs.forEach(input => {
            // Real-time validation on blur
            input.addEventListener('blur', () => this.validateField(input));
            // Clear error on input
            input.addEventListener('input', () => this.clearError(input));
        });
    },

    initCoverageForm() {
        const form = document.getElementById('coverageForm');
        if (!form) return;

        const input = document.getElementById('addressInput');
        if (input) {
            input.addEventListener('blur', () => this.validateField(input));
            input.addEventListener('input', () => this.clearError(input));
        }
    },

    validateField(input) {
        const formGroup = input.closest('.form-group') || input.parentElement;
        this.clearError(input);

        let isValid = true;
        let errorMessage = '';

        // Required check
        if (input.hasAttribute('required') && !input.value.trim()) {
            isValid = false;
            errorMessage = 'This field is required';
        }

        // Email validation
        if (input.type === 'email' && input.value.trim()) {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(input.value.trim())) {
                isValid = false;
                errorMessage = 'Please enter a valid email address';
            }
        }

        // Phone validation (basic)
        if (input.type === 'tel' && input.value.trim()) {
            const phoneRegex = /^[\d\s\-\+\(\)]{7,}$/;
            if (!phoneRegex.test(input.value.trim())) {
                isValid = false;
                errorMessage = 'Please enter a valid phone number';
            }
        }

        if (!isValid) {
            this.showError(formGroup, errorMessage);
        } else if (input.value.trim()) {
            formGroup.classList.add('has-success');
        }

        return isValid;
    },

    showError(formGroup, message) {
        formGroup.classList.add('has-error');
        formGroup.classList.remove('has-success');
        
        // Remove existing error message
        const existingError = formGroup.querySelector('.form-error');
        if (existingError) existingError.remove();

        // Add error message
        const error = document.createElement('span');
        error.className = 'form-error';
        error.textContent = message;
        error.setAttribute('role', 'alert');
        formGroup.appendChild(error);
    },

    clearError(input) {
        const formGroup = input.closest('.form-group') || input.parentElement;
        formGroup.classList.remove('has-error');
        const error = formGroup.querySelector('.form-error');
        if (error) error.remove();
    },

    validateForm(form) {
        const inputs = form.querySelectorAll('input, select, textarea');
        let isFormValid = true;

        inputs.forEach(input => {
            if (!this.validateField(input)) {
                isFormValid = false;
            }
        });

        return isFormValid;
    }
};

/* ----- Plan Selection (links Select Plan buttons to checkout) ----- */
const PlanSelection = {
    init() {
        document.querySelectorAll('.plan-card').forEach(card => {
            const cta = card.querySelector('.btn');
            if (!cta) return;

            const label = (cta.textContent || '').trim().toLowerCase();
            // Only rewrite Select Plan / Get Started style CTAs, not "Learn More" / "Contact Sales"
            if (!['select plan', 'get started', 'choose plan'].includes(label)) return;

            const nameEl = card.querySelector('.plan-name');
            const amountEl = card.querySelector('.plan-price .amount');
            if (!nameEl || !amountEl) return;

            const planName = nameEl.textContent.trim();
            const planPrice = amountEl.textContent.trim();
            const url = `/pages/checkout?plan=${encodeURIComponent(planName)}&price=${encodeURIComponent(planPrice)}`;
            cta.setAttribute('href', url);
        });
    }
};

/* ----- Main App ----- */
const App = {
    init() {
        MobileNav.init();
        MobileDropdown.init();
        DropdownKeyboard.init();
        HeaderScroll.init();
        SmoothScroll.init();
        CoverageForm.init();
        ContactForm.init();
        FormValidation.init();
        ActiveNav.init();
        DynamicYear.init();
        Breadcrumb.init();
        PlanSelection.init();
        Animations.init();
    }
};

/* ----- Initialize ----- */
// For pages using component loader
window.ComponentLoader = ComponentLoader;

// For pages with inline components, init on DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
    // Only init if components aren't being loaded dynamically
    if (!document.getElementById('header-placeholder')) {
        App.init();
    }
});
