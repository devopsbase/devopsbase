util.onReady(function() {
  if (!dob.disqus.include) return;

  var disqus_shortname = 'devopsbase';

  var dsq = document.createElement('script'); dsq.type = 'text/javascript'; dsq.async = true;
  dsq.src = '//' + disqus_shortname + '.disqus.com/embed.js';
  (document.getElementsByTagName('head')[0] || document.getElementsByTagName('body')[0]).appendChild(dsq);
});



_.set(dob, 'disqus.load', function(impl, callback) {
  if (!dob.disqus.include) return callback();

  var disqusElement = document.getElementById('disqus_thread');
  if (disqusElement) disqusElement.parentNode.removeChild(disqusElement);

  var mainContent = document.getElementById('main-content');

  mainContent.insertAdjacentHTML('beforeend', dob.tpl['title-cell']({ title: 'Discussion' }) + dob.tpl['disqus']());

  componentHandler.upgradeElements(mainContent);

  var disqus_identifier = 'impl-' + _.kebabCase(impl.name);
  var disqus_url = 'http://www.devopsbase.org/#!' + 'impl-' + _.kebabCase(impl.name);

  if (window.DISQUS) return DISQUS.reset({
    reload: true,
    config: function() {  
      this.page.identifier = disqus_identifier;  
      this.page.url = disqus_url;
    }
  });

  callback();
});
