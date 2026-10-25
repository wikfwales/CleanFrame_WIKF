/* Public Tizen application APIs. No Mac server, network address or credentials. */
(function () {
  'use strict';
  var IDS = {
    stremio: 'IkWsFHtOY9.Stremio', netflix: 'org.tizen.netflix-app',
    disneyplus: 'MCmYXNxgcu.DisneyPlus', youtube: '9Ur5IzDKqV.TizenYouTube',
    appletv: 'com.samsung.tv.aria-video', primevideo: 'org.tizen.primevideo',
    abciview: 'mWK87Xghap.ABCiview', sbs: 'OyE7OuxlUi.SBSOnDemand',
    applemusic: 'org.tizen.apple.apple-music'
  };
  var STREAMING = ['as6cYRgkPy.Binge', '73iTZRTc34.Stan', '5b8c3eb16b.BeamCTVDev',
    'KaLitts8bq.tenplaySamsungTizen', 'eYuOiOLYQX.KayoSports', 'Ne2ZsPWdKl.9NOW',
    '3KA0pm7a7V.TubiTV', 'rJeHak5zRg.Spotify', 'icp4AvUPiA.7plus'];
  var CONSUMER_SYSTEM = ['org.tizen.browser', 'com.microsoft.copilot'];
  var EXTRA_BRANDS = {'rJeHak5zRg.Spotify': 'spotify', '5b8c3eb16b.BeamCTVDev': 'hbomax', '3KA0pm7a7V.TubiTV': 'tubi'};
  var INTERNAL = ['adplatform.ADPlayer', 'WykOS4t4F0.cmsWebApp', '25emanual3.emanual',
    'ZODRT12q2l.WebAccountExtension', 'ByJlgt0XeD.CastSettingsApp', 'tv6pbVMQFF.PrivacyChoices'];
  var SELF = 'nClrkHome1.FrameHome';
  function api() { return window.tizen && window.tizen.application; }
  function unavailable(done) {
    done({ message: 'Open CleanFrame on the TV to use this control.', detail: 'The web preview cannot control the TV.' });
  }
  function failure(err) {
    return { message: 'The TV could not open this screen.', detail: err && (err.message || err.name) || 'Try again, or press the remote’s Home button to return to CleanFrame.' };
  }
  function bounded(done) {
    var finished = false, timer = setTimeout(function () { finish({ message: 'The TV did not respond. Please try again.' }); }, 8000);
    function finish(err, value) { if (finished) return; finished = true; clearTimeout(timer); done(err, value); }
    return finish;
  }
  function launchApp(id, done) {
    if (!api()) { unavailable(done); return; }
    var finish = bounded(done);
    try { api().launch(id, function () { finish(null); }, function (err) { finish(failure(err)); }); }
    catch (err) { finish(failure(err)); }
  }
  function launch(brand, done) {
    if (!IDS[brand]) { done({message: 'This app has no launch target.'}); return; }
    launchApp(IDS[brand], done);
  }
  // Resolve native targets from the current television, never from a model guess.
  var SHORTCUT_NAMES = {
    stremio: ['stremio'], youtube: ['youtube'], primevideo: ['amazon prime video', 'prime video'],
    tvplus: ['samsung tv plus', 'tv plus'], whio: ['whio', 'whio-tv', 'whio-tv dayton', 'whio tv']
  };
  function shortcut(id, done) {
    if (id === 'alexa') {
      done({ message: 'Alexa has no verified direct app launch.', detail: 'Use the microphone button on a compatible Samsung remote after selecting Alexa in TV Voice Assistant settings. Availability depends on region, firmware and Alexa setup.' });
      return;
    }
    if (id === 'lookmovie') { website('https://www.lookmovie2.to/', done); return; }
    if (!api()) { unavailable(done); return; }
    var finish = bounded(done), names = SHORTCUT_NAMES[id];
    if (!names) { finish({ message: 'This shortcut has no verified launch mechanism.' }); return; }
    try {
      api().getAppsInfo(function (list) {
        var matches = list.filter(function (a) {
          return a.id === IDS[id] || names.indexOf(String(a.name || '').toLowerCase().trim()) >= 0;
        });
        if (matches.length !== 1) {
          finish({ message: matches.length ? 'More than one matching app was found.' : 'This app is not installed or could not be identified.', detail: 'Open Samsung Apps to check availability in your region. No substitute app or website was launched.' }); return;
        }
        try { api().launch(matches[0].id, function () { finish(null); }, function (err) { finish(failure(err)); }); }
        catch (err) { finish(failure(err)); }
      }, function (err) { finish(failure(err)); });
    } catch (err) { finish(failure(err)); }
  }
  function website(url, done) {
    if (url !== 'https://www.lookmovie2.to/') { done({ message: 'Unknown website target.' }); return; }
    if (!api()) { unavailable(done); return; }
    var finish = bounded(done);
    try {
      // Standard Tizen VIEW contract. The installed browser must handle HTTPS URIs.
      var control = new tizen.ApplicationControl('http://tizen.org/appcontrol/operation/view', url);
      api().launchAppControl(control, null, function () { finish(null); }, function (err) {
        finish({ message: 'The TV could not open the website in a browser.', detail: (err && (err.message || err.name) || 'No browser handler responded.') + ' External URL handling is not verified on this AU8000; open the URL manually in Internet.' });
      });
    } catch (err) { finish(failure(err)); }
  }
  function art(done) {
    if (!api()) { unavailable(done); return; }
    var finish = bounded(done);
    try {
      var data = [new tizen.ApplicationControlData('mode', ['fullscreen']), new tizen.ApplicationControlData('requester', ['mobile'])];
      var control = new tizen.ApplicationControl('http://tizen.org/appcontrol/operation/default', null, null, null, data);
      api().launchAppControl(control, 'org.tizen.art-app', function () { finish(null); }, function (err) { finish(failure(err)); });
    } catch (err) { finish(failure(err)); }
  }
  function home(done) { launchApp('com.samsung.tv.csfs', done); }
  function settings(done) { launchApp('com.samsung.tv.coba.setting', done); }
  function apps(done) {
    if (!api()) { unavailable(done); return; }
    var finish = bounded(done);
    try {
      api().getAppsInfo(function (list) {
        var known = {}, seen = {}, result = [];
        Object.keys(IDS).forEach(function (brand) { known[IDS[brand]] = brand; });
        list.forEach(function (a) {
          var primary = !!known[a.id], stream = STREAMING.indexOf(a.id) >= 0;
          var consumer = /^[A-Za-z0-9]{10}\.[A-Za-z0-9_-]+$/.test(a.id) || CONSUMER_SYSTEM.indexOf(a.id) >= 0;
          if (a.id === SELF || INTERNAL.indexOf(a.id) >= 0 || seen[a.id] || !a.name || (!primary && !stream && (!a.show || !consumer))) return;
          if (!primary && /(?:service|worker|preview|promotion|plugin|launcher|test|sdk|^ep[ -]|factory|daemon)/i.test(a.name + ' ' + a.id)) return;
          if (/-dummy$/.test(a.id) || a.id === 'com.samsung.tv.cobalt-yt') return;
          seen[a.id] = true;
          result.push({ appId: a.id, name: a.name, brand: known[a.id] || EXTRA_BRANDS[a.id] || '', icon: a.iconPath || '', rank: primary ? Object.keys(IDS).indexOf(known[a.id]) : (stream ? 20 : 30) });
        });
        result.sort(function (a, b) { return a.rank - b.rank || a.name.toLowerCase().localeCompare(b.name.toLowerCase()); });
        finish(null, result);
      }, function (err) { finish(failure(err)); });
    } catch (err) { finish(failure(err)); }
  }
  window.FrameDevice = { shortcut: shortcut, website: website, launch: launch, launchApp: launchApp, art: art, home: home, settings: settings, apps: apps };
}());
