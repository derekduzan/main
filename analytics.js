/* Derek Duzan Link-in-Bio Visitor Intelligence
   GitHub Pages client -> Google Apps Script collector.
*/
(() => {
  'use strict';

  const CONFIG = {
    endpoint: 'https://script.google.com/macros/s/AKfycbx8imgi4QdYaJaSZFxYV4fEy4Y-Tn4Oql88WI9cWgDeuWgjefYFas3t-Q8L2qMC8YQ/exec',
    siteId: 'derekduzan-main',
    geoLookupUrl: 'https://ipapi.co/json/',
    threatLookupBase: 'https://api.ipapi.is/?q=',
    sessionTimeoutMinutes: 30,
    debug: false
  };

  const storage = {
    get(key) { try { return localStorage.getItem(key); } catch (_) { return null; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch (_) {} }
  };

  const randomId = (prefix) => {
    const bytes = new Uint8Array(10);
    if (globalThis.crypto?.getRandomValues) crypto.getRandomValues(bytes);
    else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    return `${prefix}_${Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')}`;
  };

  const now = Date.now();
  let visitorId = storage.get('dda_visitor_id');
  if (!visitorId) {
    visitorId = randomId('v');
    storage.set('dda_visitor_id', visitorId);
  }

  let sessionId = storage.get('dda_session_id');
  const lastSeen = Number(storage.get('dda_last_seen') || 0);
  if (!sessionId || now - lastSeen > CONFIG.sessionTimeoutMinutes * 60 * 1000) {
    sessionId = randomId('s');
    storage.set('dda_session_id', sessionId);
  }
  storage.set('dda_last_seen', String(now));

  const sessionStartedAt = Number(sessionStorage.getItem('dda_session_started_at') || now);
  sessionStorage.setItem('dda_session_started_at', String(sessionStartedAt));

  const intel = {
    publicIp: '', city: '', region: '', regionCode: '', country: '', countryName: '', postal: '',
    latitude: '', longitude: '', ipTimeZone: '', asn: '', org: '', companyName: '', asnOrg: '',
    isDatacenter: false, isTor: false, isProxy: false, isVpn: false, isAbuser: false
  };

  let lastActivityAt = now;
  let maxScrollDepth = 0;
  let formStarted = false;

  function endpointReady() {
    return CONFIG.endpoint.startsWith('https://script.google.com/macros/s/') && CONFIG.endpoint.endsWith('/exec');
  }

  function deviceType() {
    const ua = navigator.userAgent || '';
    if (/tablet|ipad/i.test(ua)) return 'tablet';
    if (/mobi|android|iphone/i.test(ua)) return 'mobile';
    return 'desktop';
  }

  function bool(v) { return v === true; }

  function networkFlags() {
    return [
      intel.isDatacenter ? 'Datacenter/hosting' : '',
      intel.isTor ? 'Tor' : '',
      intel.isProxy ? 'Proxy' : '',
      intel.isVpn ? 'VPN' : '',
      intel.isAbuser ? 'Abuse-listed' : ''
    ].filter(Boolean).join(', ');
  }

  function basePayload(eventName, detail = '', extra = {}) {
    const nav = performance.getEntriesByType?.('navigation')?.[0];
    const browserTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    return {
      siteId: CONFIG.siteId,
      eventName,
      detail,
      visitorId,
      sessionId,
      clientTimestamp: new Date().toISOString(),
      pageUrl: location.href,
      pagePath: location.pathname + location.search,
      pageTitle: document.title,
      referrer: document.referrer || 'Direct / unavailable',

      publicIp: intel.publicIp,
      ipCity: intel.city,
      ipRegion: intel.region,
      ipRegionCode: intel.regionCode,
      ipCountry: intel.country,
      ipCountryName: intel.countryName,
      ipPostal: intel.postal,
      ipLatitude: intel.latitude,
      ipLongitude: intel.longitude,
      ipTimeZone: intel.ipTimeZone,
      ipAsn: intel.asn,
      ipOrg: intel.org,
      ipCompany: intel.companyName,
      ipAsnOrg: intel.asnOrg,
      isDatacenter: intel.isDatacenter,
      isTor: intel.isTor,
      isProxy: intel.isProxy,
      isVpn: intel.isVpn,
      isAbuser: intel.isAbuser,
      networkFlags: networkFlags(),

      userAgent: navigator.userAgent || '',
      platform: navigator.userAgentData?.platform || navigator.platform || '',
      language: navigator.language || '',
      languages: Array.isArray(navigator.languages) ? navigator.languages.join(', ') : '',
      timeZone: browserTimeZone,
      timeZoneOffsetMinutes: new Date().getTimezoneOffset(),
      deviceType: deviceType(),
      screen: `${screen.width}x${screen.height}`,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      colorDepth: screen.colorDepth || '',
      pixelRatio: window.devicePixelRatio || 1,
      touchPoints: navigator.maxTouchPoints || 0,
      hardwareConcurrency: navigator.hardwareConcurrency || '',
      deviceMemoryGb: navigator.deviceMemory || '',
      cookiesEnabled: navigator.cookieEnabled,
      doNotTrack: navigator.doNotTrack || '',
      webdriver: Boolean(navigator.webdriver),
      online: navigator.onLine,
      connectionType: navigator.connection?.effectiveType || '',
      saveData: Boolean(navigator.connection?.saveData),
      colorScheme: matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
      loadType: nav?.type || '',
      elapsedSeconds: Math.max(0, Math.round((Date.now() - sessionStartedAt) / 1000)),
      maxScrollDepth,
      ...extra
    };
  }

  function transmit(payload, preferBeacon = false) {
    if (!endpointReady()) {
      if (CONFIG.debug) console.info('[analytics not configured]', payload);
      return Promise.resolve(false);
    }
    const body = JSON.stringify(payload);
    if (preferBeacon && navigator.sendBeacon) {
      const ok = navigator.sendBeacon(CONFIG.endpoint, new Blob([body], { type: 'text/plain;charset=UTF-8' }));
      return Promise.resolve(ok);
    }
    return fetch(CONFIG.endpoint, {
      method: 'POST', mode: 'no-cors', keepalive: true,
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, body
    }).then(() => true).catch(() => false);
  }

  function track(eventName, detail = '', extra = {}, preferBeacon = false) {
    lastActivityAt = Date.now();
    storage.set('dda_last_seen', String(lastActivityAt));
    return transmit(basePayload(eventName, detail, extra), preferBeacon);
  }

  async function collectNetworkIntel() {
    try {
      const geoRes = await fetch(CONFIG.geoLookupUrl, { cache: 'no-store' });
      const geo = await geoRes.json();
      intel.publicIp = geo.ip || '';
      intel.city = geo.city || '';
      intel.region = geo.region || '';
      intel.regionCode = geo.region_code || '';
      intel.country = geo.country_code || geo.country || '';
      intel.countryName = geo.country_name || '';
      intel.postal = geo.postal || '';
      intel.latitude = geo.latitude ?? '';
      intel.longitude = geo.longitude ?? '';
      intel.ipTimeZone = geo.timezone || '';
      intel.asn = geo.asn || '';
      intel.org = geo.org || '';
    } catch (_) {}

    if (!intel.publicIp) return;
    try {
      const threatRes = await fetch(CONFIG.threatLookupBase + encodeURIComponent(intel.publicIp), { cache: 'no-store' });
      const threat = await threatRes.json();
      if (!threat.error) {
        intel.isDatacenter = bool(threat.is_datacenter);
        intel.isTor = bool(threat.is_tor);
        intel.isProxy = bool(threat.is_proxy);
        intel.isVpn = bool(threat.is_vpn);
        intel.isAbuser = bool(threat.is_abuser);
        intel.companyName = threat.company_name || '';
        intel.asnOrg = threat.asn_org || '';
        if (!intel.asn && threat.asn_num) intel.asn = `AS${threat.asn_num}`;
      }
    } catch (_) {}
  }

  function trackOutboundLink(anchor) {
    const label = anchor.dataset.analyticsLabel || anchor.getAttribute('aria-label') || anchor.textContent.trim() || anchor.href;
    track('link_click', label, { destinationUrl: anchor.href }, true);
  }

  document.addEventListener('click', (event) => {
    const target = event.target.closest('a[href]');
    if (target) trackOutboundLink(target);
  }, true);

  document.addEventListener('input', (event) => {
    if (!formStarted && event.target.closest('#contactForm')) {
      formStarted = true;
      track('form_started', 'Contact form');
    }
  }, { passive: true });

  window.addEventListener('scroll', () => {
    const scrollable = document.documentElement.scrollHeight - window.innerHeight;
    if (scrollable <= 0) return;
    const depth = Math.min(100, Math.round((window.scrollY / scrollable) * 100));
    if (depth > maxScrollDepth) maxScrollDepth = depth;
  }, { passive: true });

  document.addEventListener('visibilitychange', () => {
    track(document.hidden ? 'page_hidden' : 'page_visible', document.hidden ? 'Tab hidden or page left' : 'Tab visible again', {}, true);
  });

  window.addEventListener('pagehide', () => {
    track('session_exit', 'Page closed or navigated away', {
      idleSeconds: Math.round((Date.now() - lastActivityAt) / 1000)
    }, true);
  });

  window.DDAnalytics = { track, visitorId, sessionId, intel };

  (async () => {
    await collectNetworkIntel();
    track('page_view', 'Viewed homepage', {
      firstVisitThisBrowser: !storage.get('dda_seen_before')
    });
    storage.set('dda_seen_before', '1');
  })();
})();
