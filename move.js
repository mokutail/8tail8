// 8tail8 tools は https://8tail8-tools.web.app/ に引っ越しました。
// 古い住所(mokutail.github.io/8tail8/)で開いたら、保存データを持って新しい住所へ移る。
// しずくと同じ mokutail.github.io の中だと、Chrome がアプリを取りちがえてインストールできないため。
(function () {
  var NEW = 'https://8tail8-tools.web.app';
  var KEYS = /^(booth-maker|kp-board|jirai-sheet|post-maker)/;
  try {
    if (location.hostname === 'mokutail.github.io') {
      var data = {}, n = 0;
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (KEYS.test(k)) { data[k] = localStorage.getItem(k); n++; }
      }
      var path = location.pathname.replace(/^\/[^/]+\//, '/');
      var hash = '';
      if (n) {
        hash = '#move=' + encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify(data)))));
        if (hash.length > 1800000) hash = ''; // 大きすぎるときは運ばない
      }
      location.replace(NEW + path + location.search + hash);
      return;
    }
    if (location.hash.indexOf('#move=') === 0) {
      var got = JSON.parse(decodeURIComponent(escape(atob(decodeURIComponent(location.hash.slice(6))))));
      for (var key in got) {
        if (KEYS.test(key) && localStorage.getItem(key) === null) localStorage.setItem(key, got[key]);
      }
      history.replaceState(null, '', location.pathname + location.search);
    }
  } catch (e) { /* 引っ越しできなくても動く */ }
})();
