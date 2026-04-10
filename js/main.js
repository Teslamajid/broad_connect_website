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
        
        if (!address) return;

        // Show loading state
        const btn = this.form.querySelector('button');
        const originalText = btn.textContent;
        btn.textContent = 'Checking...';
        btn.disabled = true;

        // Simulate API call
        setTimeout(() => {
            this.showResult(address);
            btn.textContent = originalText;
            btn.disabled = false;
            this.input.value = '';
        }, 1000);
    },

    showResult(address) {
        if (this.result) {
            this.result.innerHTML = `
                <div class="coverage-success">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                    <p><strong>Great news!</strong> BroadConnect services are available at <em>${address}</em>. Our team will contact you shortly.</p>
                </div>
            `;
            this.result.style.display = 'block';
        } else {
            alert(`Great news! BroadConnect services are available at ${address}. Our team will contact you shortly.`);
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
        
        const formData = new FormData(this.form);
        const data = Object.fromEntries(formData);
        
        // Show loading
        const btn = this.form.querySelector('button[type="submit"]');
        const originalText = btn.textContent;
        btn.textContent = 'Sending...';
        btn.disabled = true;

        // Simulate form submission
        setTimeout(() => {
            this.showSuccess();
            btn.textContent = originalText;
            btn.disabled = false;
            this.form.reset();
        }, 1500);
    },

    showSuccess() {
        const successMsg = document.createElement('div');
        successMsg.className = 'form-success';
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
    init() {
        if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') return;

        gsap.registerPlugin(ScrollTrigger);

        // Hero animations
        gsap.from('.hero-title', {
            duration: 1,
            y: 40,
            opacity: 0,
            ease: 'power3.out'
        });

        gsap.from('.hero-subtitle', {
            duration: 1,
            y: 40,
            opacity: 0,
            ease: 'power3.out',
            delay: 0.15
        });

        gsap.from('.hero .btn', {
            duration: 1,
            y: 40,
            opacity: 0,
            ease: 'power3.out',
            delay: 0.3
        });

        // Section titles
        gsap.utils.toArray('.section-title').forEach(title => {
            gsap.from(title, {
                scrollTrigger: {
                    trigger: title,
                    start: 'top 85%',
                    toggleActions: 'play none none none'
                },
                duration: 0.7,
                y: 25,
                opacity: 0,
                ease: 'power2.out'
            });
        });

        // Cards with stagger
        const cardGroups = [
            { selector: '.plan-card', trigger: '.plans-grid' },
            { selector: '.feature-card', trigger: '.features-grid' },
            { selector: '.service-card', trigger: '.services-grid' },
            { selector: '.testimonial-card', trigger: '.testimonials-grid' }
        ];

        cardGroups.forEach(({ selector, trigger }) => {
            const cards = document.querySelectorAll(selector);
            if (cards.length === 0) return;

            gsap.from(selector, {
                scrollTrigger: {
                    trigger: trigger,
                    start: 'top 80%',
                    toggleActions: 'play none none none'
                },
                duration: 0.5,
                y: 40,
                opacity: 0,
                stagger: 0.1,
                ease: 'power2.out'
            });
        });
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

/* ----- Main App ----- */
const App = {
    init() {
        MobileNav.init();
        MobileDropdown.init();
        HeaderScroll.init();
        SmoothScroll.init();
        CoverageForm.init();
        ContactForm.init();
        DynamicYear.init();
        Breadcrumb.init();
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
