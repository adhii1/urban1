// TORQQ Driver Shared Layout Coordinator & Auth Guard
// Automatically runs on DOM load to coordinate navigation, authentication, theme updates, and responsive drawers

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Authentication Guard check
    const isAuthPage = ['login.html', 'register.html', 'otp.html', 'forgot-password.html'].some(page => 
        window.location.pathname.endsWith(page)
    );

    if (!isAuthPage) {
        if (window.AUTH_API && !window.AUTH_API.checkAuthGuard()) {
            return; // Terminate load, redirecting to login
        }
        
        // Fetch real database profile
        // Guarded call – polling handled in dashboard.js


        if (window.DRIVER_API && window.DRIVER_API.getProfile) {
            window.DRIVER_API.getProfile().catch(console.error);
        }

        // Fetch notifications globally so the navbar bell badge count is
        // accurate on every page, not just the notifications page.
        if (window.NOTIFICATION_API && window.NOTIFICATION_API.getNotifications) {
            window.NOTIFICATION_API.getNotifications().catch(console.error);
            if (!window._notifPollStarted) {
                window._notifPollStarted = true;
                setInterval(() => {
                    window.NOTIFICATION_API.getNotifications().catch(console.error);
                }, 15000);
            }
        }
    }

    // 2. Load Reusable Components dynamically
    await loadReusableComponents();

    // 3. Initialize Shared State listeners
    initializeStateSync();

    // 4. Set active page styling in sidebar
    highlightActiveSidebarMenu();

    // 5. Start live clock & date timer
    startClockTimer();

    // 6. Connect Simulated WebSocket if online
    if (window.STATE.getState('onlineStatus') === 'ONLINE') {
        if (!window._socketConnected) {
        window.SOCKET.connect();
        window._socketConnected = true;
        window._tripsPollingStarted = true;
    }
    }
});

// Dynamic component loader with HTTP fetch & local string fallbacks for file:// compatibility
async function loadReusableComponents() {
    const parentPath = '../components/'; // Components are located relative to pages/
    
    // Select placeholder container targets
    const sidebarContainer = document.getElementById('sidebar-placeholder');
    const navbarContainer = document.getElementById('navbar-placeholder');
    const footerContainer = document.getElementById('footer-placeholder');

    // Sidebar Fallback Markup
    const sidebarFallback = `
        <div class="sidebar glass-card" style="width:var(--sidebar-width); height:100vh; position:fixed; top:0; left:0; z-index:100; display:flex; flex-direction:column; padding:24px 16px; border-radius:0 var(--border-radius-lg) var(--border-radius-lg) 0; border-left:none; border-top:none; border-bottom:none; transition:var(--transition-smooth);">
            <div class="sidebar-brand" style="display:flex; align-items:center; gap:12px; margin-bottom:32px; padding-left:8px;">
                <span class="logo-icon" style="background:#16C15D; color:#FFFFFF; width:36px; height:36px; border-radius:10px; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:20px; box-shadow:0 4px 12px rgba(22, 193, 93, 0.3);">T</span>
                <div>
                    <h1 style="font-size:18px; font-weight:700; color:var(--text-main); line-height:1.1;">TORQQ</h1>
                    <span style="font-size:10px; color:var(--text-light); font-weight:500; letter-spacing:1px;">DRIVER PANEL</span>
                </div>
            </div>
            <div class="driver-profile-widget" style="display:flex; align-items:center; gap:12px; padding:16px 12px; background:var(--bg-hover); border-radius:var(--border-radius-md); margin-bottom:24px; border:1px solid var(--border-color); position:relative;">
                <div style="position:relative;">
                    <img id="sidebarDriverAvatar" src="" class="avatar" alt="Driver Avatar">
                    <span id="sidebarOnlineIndicator" style="position:absolute; bottom:2px; right:2px; width:12px; height:12px; border-radius:50%; background:#EF4444; border:2px solid var(--bg-card-solid);"></span>
                </div>
                <div style="flex-grow:1; min-width:0;">
                    <h2 id="sidebarDriverName" style="font-size:14px; font-weight:700; color:var(--text-main); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-bottom:2px;">Loading…</h2>
                    <div style="display:flex; align-items:center; gap:4px;">
                        <span style="color:#F59E0B; font-size:12px;">★</span>
                        <span id="sidebarDriverRating" style="font-size:12px; font-weight:600; color:var(--text-main);">—</span>
                        <span id="sidebarDriverVehicle" style="font-size:11px; color:var(--text-light);"></span>
                    </div>
                </div>
            </div>
            <nav class="sidebar-menu" style="flex-grow:1; overflow-y:auto; display:flex; flex-direction:column; gap:4px; margin-bottom:16px;">
                <a href="dashboard.html" class="menu-link" id="nav-dashboard" style="display:flex; align-items:center; gap:12px; padding:12px 16px; border-radius:var(--border-radius-sm); font-size:14px; font-weight:500; color:var(--text-light); transition:var(--transition-smooth);"><i class="lucide-layout-dashboard"></i><span>Dashboard</span></a>
                <a href="my-trips.html" class="menu-link" id="nav-trips" style="display:flex; align-items:center; gap:12px; padding:12px 16px; border-radius:var(--border-radius-sm); font-size:14px; font-weight:500; color:var(--text-light); transition:var(--transition-smooth);"><i class="lucide-route"></i><span>My Trips</span></a>
                <a href="passengers.html" class="menu-link" id="nav-passengers" style="display:flex; align-items:center; gap:12px; padding:12px 16px; border-radius:var(--border-radius-sm); font-size:14px; font-weight:500; color:var(--text-light); transition:var(--transition-smooth);"><i class="lucide-users"></i><span>Passengers</span></a>
                <a href="routes.html" class="menu-link" id="nav-routes" style="display:flex; align-items:center; gap:12px; padding:12px 16px; border-radius:var(--border-radius-sm); font-size:14px; font-weight:500; color:var(--text-light); transition:var(--transition-smooth);"><i class="lucide-map-pinned"></i><span>Routes</span></a>
                <a href="earnings.html" class="menu-link" id="nav-earnings" style="display:flex; align-items:center; gap:12px; padding:12px 16px; border-radius:var(--border-radius-sm); font-size:14px; font-weight:500; color:var(--text-light); transition:var(--transition-smooth);"><i class="lucide-wallet"></i><span>Earnings</span></a>
                <a href="payouts.html" class="menu-link" id="nav-payouts" style="display:flex; align-items:center; gap:12px; padding:12px 16px; border-radius:var(--border-radius-sm); font-size:14px; font-weight:500; color:var(--text-light); transition:var(--transition-smooth);"><i class="lucide-arrow-right-left"></i><span>Payouts</span></a>
                <a href="analytics.html" class="menu-link" id="nav-analytics" style="display:flex; align-items:center; gap:12px; padding:12px 16px; border-radius:var(--border-radius-sm); font-size:14px; font-weight:500; color:var(--text-light); transition:var(--transition-smooth);"><i class="lucide-trending-up"></i><span>Analytics</span></a>
                <a href="notifications.html" class="menu-link" id="nav-notifications" style="display:flex; align-items:center; gap:12px; padding:12px 16px; border-radius:var(--border-radius-sm); font-size:14px; font-weight:500; color:var(--text-light); transition:var(--transition-smooth); justify-content:space-between;">
                    <div style="display:flex; align-items:center; gap:12px;"><i class="lucide-bell"></i><span>Notifications</span></div>
                    <span id="sidebarNotificationBadge" class="badge badge-danger" style="padding:2px 6px; font-size:10px; display:none;">0</span>
                </a>
                <a href="documents.html" class="menu-link" id="nav-documents" style="display:flex; align-items:center; gap:12px; padding:12px 16px; border-radius:var(--border-radius-sm); font-size:14px; font-weight:500; color:var(--text-light); transition:var(--transition-smooth);"><i class="lucide-file-text"></i><span>Documents</span></a>
                <a href="vehicle.html" class="menu-link" id="nav-vehicle" style="display:flex; align-items:center; gap:12px; padding:12px 16px; border-radius:var(--border-radius-sm); font-size:14px; font-weight:500; color:var(--text-light); transition:var(--transition-smooth);"><i class="lucide-car"></i><span>Vehicle Info</span></a>
                <a href="support.html" class="menu-link" id="nav-support" style="display:flex; align-items:center; gap:12px; padding:12px 16px; border-radius:var(--border-radius-sm); font-size:14px; font-weight:500; color:var(--text-light); transition:var(--transition-smooth);"><i class="lucide-headset"></i><span>Support</span></a>
                <a href="settings.html" class="menu-link" id="nav-settings" style="display:flex; align-items:center; gap:12px; padding:12px 16px; border-radius:var(--border-radius-sm); font-size:14px; font-weight:500; color:var(--text-light); transition:var(--transition-smooth);"><i class="lucide-settings"></i><span>Settings</span></a>
            </nav>
            <div class="today-earnings-card" style="padding:16px; background:var(--bg-hover); border-radius:var(--border-radius-md); border:1px solid var(--border-color); margin-bottom:16px;">
                <span style="font-size:11px; font-weight:600; color:var(--text-light); text-transform:uppercase; letter-spacing:0.5px;">Today's Revenue</span>
                <div id="sidebarTodayEarnings" style="font-size:20px; font-weight:700; color:var(--text-main); margin:4px 0;">₹0.00</div>
                <div style="font-size:11px; color:var(--text-light);">Trips completed: <span id="sidebarTodayTrips" style="font-weight:600; color:var(--color-primary);">0</span></div>
            </div>
            <div>
                <button id="goOfflineBtn" class="btn btn-danger" style="width:100%; border-radius:var(--border-radius-md); justify-content:center; gap:8px;"><i class="lucide-power"></i><span>Go Offline</span></button>
            </div>
        </div>
    `;

    // Navbar Fallback Markup
    const navbarFallback = `
        <header class="navbar glass-card" style="height:var(--navbar-height); position:fixed; top:0; left:var(--sidebar-width); right:0; z-index:99; display:flex; align-items:center; justify-content:space-between; padding:0 24px; border-radius:0; border-top:none; border-left:none; border-right:none; transition:var(--transition-smooth);">
            <div style="display:flex; align-items:center; gap:16px;">
                <button id="mobileMenuToggleBtn" style="display:none; padding:8px; border-radius:8px; background:var(--bg-hover); color:var(--text-main); cursor:pointer; border:none; font-size:20px;"><i class="lucide-menu"></i></button>
                <div>
                    <span id="navGreeting" style="font-size:12px; font-weight:600; color:var(--text-light); text-transform:uppercase;">Good Morning</span>
                    <h1 id="navDriverGreetingName" style="font-size:18px; font-weight:700; color:var(--text-main);">Welcome back</h1>
                </div>
            </div>
            <div class="nav-search-container" style="flex-grow:1; max-width:320px; margin:0 32px; position:relative;">
                <i class="lucide-search" style="position:absolute; left:12px; top:50%; transform:translateY(-50%); color:var(--text-light);"></i>
                <input type="text" id="navSearchInput" placeholder="Search trips, routes..." style="width:100%; padding:10px 12px 10px 38px; border-radius:var(--border-radius-md); border:1px solid var(--border-color); background:var(--bg-app); color:var(--text-main); font-size:13px;">
            </div>
            <div style="display:flex; align-items:center; gap:16px;">
                <div id="navLiveClock" style="font-size:13px; font-weight:600; color:var(--text-light); text-align:right; border-right:1px solid var(--border-color); padding-right:16px;">
                    <div>Tuesday, 7 Jul</div>
                    <div style="font-size:11px; font-weight:500;">12:54 PM</div>
                </div>
                <button id="navSosBtn" class="btn btn-danger" style="padding:8px 16px; font-size:12px; font-weight:700; border-radius:var(--border-radius-sm); background-color:#EF4444; color:#FFFFFF; animation:pulse-sos 1.5s infinite;"><i class="lucide-alert-octagon"></i><span>SOS</span></button>
                <div style="display:flex; align-items:center; gap:8px; border-right:1px solid var(--border-color); padding-right:16px;">
                    <span id="navOnlineLabel" style="font-size:12px; font-weight:600; color:var(--text-light);">Offline</span>
                    <label class="switch-toggle" style="position:relative; display:inline-block; width:44px; height:24px;">
                        <input type="checkbox" id="navOnlineToggle" style="opacity:0; width:0; height:0;">
                        <span class="slider-round" style="position:absolute; cursor:pointer; top:0; left:0; right:0; bottom:0; background-color:#EF4444; transition:.3s; border-radius:34px;"></span>
                    </label>
                </div>
                <div style="position:relative;">
                    <button id="navNotificationBtn" style="padding:10px; border-radius:10px; background:var(--bg-hover); color:var(--text-main); cursor:pointer; border:none; font-size:18px;"><i class="lucide-bell"></i></button>
                    <span id="navNotificationBadge" style="position:absolute; top:-4px; right:-4px; width:18px; height:18px; background:#EF4444; color:#FFFFFF; border-radius:50%; font-size:10px; font-weight:700; display:none; align-items:center; justify-content:center; border:2px solid var(--bg-card-solid);">0</span>
                </div>
                <a href="profile.html"><img id="navDriverAvatar" src="" class="avatar" style="width:38px; height:38px;" alt="Avatar"></a>
            </div>
        </header>
    `;

    // Footer Fallback Markup
    const footerFallback = `
        <footer style="padding:24px 0; text-align:center; border-top:1px solid var(--border-color); margin-top:48px; font-size:13px; color:var(--text-light);">
            <div>&copy; 2026 <strong style="color:var(--color-primary);">TORQQ</strong> Cab Platform. All rights reserved.</div>
            <div style="font-size:11px; margin-top:4px;">Powered by Advanced SaaS Core Engine v1.0.0.</div>
        </footer>
    `;

    // Attempt dynamically fetching files, but default back to string injection on local double-clicks (CORS limitations)
    if (sidebarContainer) {
        try {
            const res = await fetch(parentPath + 'sidebar.html');
            if (!res.ok) throw new Error();
            sidebarContainer.innerHTML = await res.text();
        } catch (e) {
            sidebarContainer.innerHTML = sidebarFallback;
        }
    }

    if (navbarContainer) {
        try {
            const res = await fetch(parentPath + 'navbar.html');
            if (!res.ok) throw new Error();
            navbarContainer.innerHTML = await res.text();
        } catch (e) {
            navbarContainer.innerHTML = navbarFallback;
        }
    }

    if (footerContainer) {
        try {
            const res = await fetch(parentPath + 'footer.html');
            if (!res.ok) throw new Error();
            footerContainer.innerHTML = await res.text();
        } catch (e) {
            footerContainer.innerHTML = footerFallback;
        }
    }

    // Set up click actions for sidebar navigation and drawers
    setupResponsiveMenuToggle();
}

// Synchronize element states with the global reactive window.STATE
function initializeStateSync() {
    // Theme sync
    window.STATE.subscribe('theme', (theme) => {
        document.documentElement.setAttribute('data-theme', theme);
        // Custom events to map redraw
        window.dispatchEvent(new CustomEvent('stateChanged_theme', { detail: theme }));
    });

    // Driver Profile Info sync
    //
    // Every field is read defensively. Previously `driver.rating.toFixed(2)` threw
    // on the real API payload (which has no `rating`), and the exception escaped
    // through setState into a swallowed .catch — so any widget updated after the
    // rating line silently never ran.
    window.STATE.subscribe('currentDriver', (driver) => {
        if (!driver) return;

        const avatars = [document.getElementById('sidebarDriverAvatar'), document.getElementById('navDriverAvatar')];
        const sidebarName = document.getElementById('sidebarDriverName');
        const navName = document.getElementById('navDriverGreetingName');
        const rating = document.getElementById('sidebarDriverRating');
        const vehicle = document.getElementById('sidebarDriverVehicle');

        const name = String(driver.name || '').trim();

        avatars.forEach(img => {
            if (!img) return;
            img.src = driver.avatar || window.UTILS.initialsAvatar(name, 96);
            img.alt = name ? `${name} profile photo` : 'Driver profile photo';
        });

        if (sidebarName) sidebarName.textContent = name || 'Driver';
        if (navName) navName.textContent = name ? `Welcome Back, ${name.split(' ')[0]}` : 'Welcome back';

        if (rating) {
            const score = Number(driver.rating);
            rating.textContent = Number.isFinite(score) && score > 0 ? score.toFixed(2) : 'New';
        }
        if (vehicle) {
            vehicle.textContent = driver.vehicleNumber ? `(${driver.vehicleNumber})` : '';
        }
    });

    // Online/Offline Status sync
    window.STATE.subscribe('onlineStatus', (status) => {
        const onlineIndicator = document.getElementById('sidebarOnlineIndicator');
        const onlineToggle = document.getElementById('navOnlineToggle');
        const onlineLabel = document.getElementById('navOnlineLabel');
        const goOfflineBtn = document.getElementById('goOfflineBtn');

        if (status === 'ONLINE') {
            if (onlineIndicator) onlineIndicator.style.backgroundColor = '#16C15D';
            if (onlineToggle) onlineToggle.checked = true;
            if (onlineLabel) {
                onlineLabel.textContent = 'Online';
                onlineLabel.style.color = '#16C15D';
            }
            if (goOfflineBtn) {
                goOfflineBtn.innerHTML = '<i class="lucide-power"></i><span>Go Offline</span>';
                goOfflineBtn.className = 'btn btn-danger';
            }
        } else {
            if (onlineIndicator) onlineIndicator.style.backgroundColor = '#EF4444';
            if (onlineToggle) onlineToggle.checked = false;
            if (onlineLabel) {
                onlineLabel.textContent = 'Offline';
                onlineLabel.style.color = 'var(--text-light)';
            }
            if (goOfflineBtn) {
                goOfflineBtn.innerHTML = '<i class="lucide-wifi"></i><span>Go Online</span>';
                goOfflineBtn.className = 'btn btn-primary';
            }
        }
        
        window.dispatchEvent(new CustomEvent('stateChanged_onlineStatus', { detail: status }));
    });

    // Wallet Earnings quick sync
    window.STATE.subscribe('wallet', (wallet) => {
        const sidebarEarningsVal = document.getElementById('sidebarTodayEarnings');
        const sidebarEarningsTrips = document.getElementById('sidebarTodayTrips');
        
        if (sidebarEarningsVal) {
            sidebarEarningsVal.textContent = window.UTILS.formatCurrency(wallet.balance);
        }
    });

    // Notification Badge sync
    window.STATE.subscribe('notifications', (notifications) => {
        const unreadCount = notifications.filter(n => !n.read).length;
        const navBadge = document.getElementById('navNotificationBadge');
        const sidebarBadge = document.getElementById('sidebarNotificationBadge');

        [navBadge, sidebarBadge].forEach(badge => {
            if (badge) {
                if (unreadCount > 0) {
                    badge.textContent = unreadCount;
                    badge.style.display = 'flex';
                } else {
                    badge.style.display = 'none';
                }
            }
        });
    });
}

// Side-sliding drawer configurations for mobile viewport bounds
function setupResponsiveMenuToggle() {
    const hamburgerBtn = document.getElementById('mobileMenuToggleBtn');
    const goOfflineBtn = document.getElementById('goOfflineBtn');
    const onlineToggle = document.getElementById('navOnlineToggle');
    const sosBtn = document.getElementById('navSosBtn');
    const navNotificationBtn = document.getElementById('navNotificationBtn');
    
    // Create drawer overlay dynamically
    let overlay = document.querySelector('.sidebar-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'sidebar-overlay';
        document.body.appendChild(overlay);
    }

    if (hamburgerBtn) {
        hamburgerBtn.style.display = 'flex'; // Visible on mobile via CSS
        hamburgerBtn.onclick = () => {
            document.body.classList.add('sidebar-open');
        };
    }

    overlay.onclick = () => {
        document.body.classList.remove('sidebar-open');
    };

    // Toggle duty online/offline
    const toggleDuty = () => {
        const current = window.STATE.getState('onlineStatus');
        const next = current === 'ONLINE' ? 'OFFLINE' : 'ONLINE';
        
        if (window.DRIVER_API && window.DRIVER_API.updateDutyStatus) {
            window.DRIVER_API.updateDutyStatus(next, true)
                .then(res => {
                    if (res.success) {
                        window.STATE.setState('onlineStatus', next);
                        if (next === 'ONLINE') {
                            window.SOCKET.connect();
                            window.UTILS.showToast("You are now online! Fetching active trip allocations...", "success");
                        } else {
                            window.SOCKET.disconnect();
                            window.UTILS.showToast("You are now offline. You won't receive new trip offers.", "warning");
                        }
                    } else {
                        window.UTILS.showToast(res.message || "Failed to update duty status.", "error");
                    }
                })
                .catch(err => {
                    window.UTILS.showToast(err.message || "Connection error updating duty status.", "error");
                });
        }
    };

    if (onlineToggle) onlineToggle.onchange = toggleDuty;
    if (goOfflineBtn) goOfflineBtn.onclick = toggleDuty;

    // Trigger SOS alert Modal
    if (sosBtn) {
        sosBtn.onclick = () => {
            triggerEmergencySos();
        };
    }

    // Trigger real-time drawer notifications panel routing
    if (navNotificationBtn) {
        navNotificationBtn.onclick = () => {
            window.location.href = 'notifications.html';
        };
    }
}

// Highlighting current dashboard subpage using filename match
function highlightActiveSidebarMenu() {
    const filename = window.location.pathname.split('/').pop() || 'dashboard.html';
    
    // Reset all
    document.querySelectorAll('.menu-link').forEach(link => {
        link.style.background = 'transparent';
        link.style.color = 'var(--text-light)';
        link.style.fontWeight = '500';
    });

    // Map active links
    let activeId = 'nav-dashboard';
    if (filename.includes('trips')) activeId = 'nav-trips';
    else if (filename.includes('passengers')) activeId = 'nav-passengers';
    else if (filename.includes('routes')) activeId = 'nav-routes';
    else if (filename.includes('earnings')) activeId = 'nav-earnings';
    else if (filename.includes('payouts')) activeId = 'nav-payouts';
    else if (filename.includes('analytics')) activeId = 'nav-analytics';
    else if (filename.includes('notifications')) activeId = 'nav-notifications';
    else if (filename.includes('documents')) activeId = 'nav-documents';
    else if (filename.includes('vehicle')) activeId = 'nav-vehicle';
    else if (filename.includes('support')) activeId = 'nav-support';
    else if (filename.includes('settings')) activeId = 'nav-settings';

    const activeLink = document.getElementById(activeId);
    if (activeLink) {
        activeLink.style.background = 'var(--bg-hover)';
        activeLink.style.color = 'var(--color-primary)';
        activeLink.style.fontWeight = '700';
    }
}

// Running clock updates inside top panel
function startClockTimer() {
    const clockEl = document.getElementById('navLiveClock');
    if (!clockEl) return;

    const updateClock = () => {
        const now = new Date();
        const dateStr = now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' });
        const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
        
        clockEl.innerHTML = `
            <div>${dateStr}</div>
            <div style="font-size:11px; font-weight:500; color:var(--color-primary);">${timeStr}</div>
        `;
    };

    updateClock();
    if (!window._driverClockInterval) {
        window._driverClockInterval = setInterval(updateClock, 1000);
    }
    if (!window._adminClockInterval) {
        window._adminClockInterval = setInterval(updateClock, 1000);
    }
}

// SOS Trigger Modal Engine (Countdowns to notify contacts)
function triggerEmergencySos() {
    // Show overlay alert
    let overlay = document.getElementById('emergencySosOverlay');
    if (overlay) overlay.remove();

    overlay = document.createElement('div');
    overlay.id = 'emergencySosOverlay';
    overlay.className = 'sos-overlay fade-in';
    overlay.innerHTML = `
        <div class="sos-modal scale-in">
            <h2 style="font-size: 24px; font-weight:800; color:#EF4444; margin-bottom: 8px;">EMERGENCY SOS ACTIVE</h2>
            <p style="font-size: 14px; color: var(--text-light); line-height:1.5;">Broadcasting live coordinates to dispatch, local authorities, and family contacts.</p>
            
            <div id="sosTimerDial" class="sos-countdown-dial">5</div>
            
            <div style="display:flex; flex-direction:column; gap:12px; width:100%; max-width:280px; margin: 0 auto 24px;">
                <button id="cancelSosBtn" class="btn btn-secondary" style="border: 2px solid #EF4444; color: #EF4444; font-weight:700;">CANCEL BROADCAST</button>
            </div>
            
            <div style="font-size:11px; color:var(--text-light); border-top: 1px solid var(--border-color); padding-top:16px;">
                Responders Queued: Police (100) • Ambulance (102) • TORQQ HQ Support
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    let sec = 5;
    const timerDial = document.getElementById('sosTimerDial');
    
    const countdown = setInterval(() => {
        sec--;
        if (timerDial) timerDial.textContent = sec;
        
        if (sec <= 0) {
            clearInterval(countdown);
            if (timerDial) {
                timerDial.textContent = "✔";
                timerDial.style.color = "#16C15D";
                timerDial.style.borderColor = "#16C15D";
                timerDial.style.animation = "none";
            }
            
            // Broadcast via simulated WebSocket
            window.SOCKET.emit('SOS_TRIGGER', { driverId: window.STATE.getState('currentDriver').id, coordinates: { lat: 12.9716, lng: 77.5946 } });
            
            window.UTILS.showToast("Emergency signals dispatched to all authorities!", "error");
            
            setTimeout(() => {
                overlay.remove();
            }, 2000);
        }
    }, 1000);

    document.getElementById('cancelSosBtn').onclick = () => {
        clearInterval(countdown);
        overlay.remove();
        window.UTILS.showToast("SOS Alert Cancelled.", "info");
    };
}
