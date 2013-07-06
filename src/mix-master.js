(function(jQuery) {
  "use strict";

  var $ = jQuery;

  function NullTransitionEffectManager() {
    return {
      enableDuring: function enableDuring(fn) { fn(); }
    };
  }
  
  function TransitionEffectManager(commandManager) {
    var isEnabled = false;

    commandManager.on('command-created', function(cmd) {
      cmd.on('before-replace', function before(elementToReplace) {
        if (!isEnabled)
          return;
        var overlay = $(elementToReplace).overlay();
        cmd.on('after-replace', function after(newContent) {
          cmd.removeListener('after-replace', after);
          overlay.applyTagColor(newContent, 0.25)
                 .resizeToAndFadeOut(newContent);            
        });
      });
    });
    
    return {
      enableDuring: function enableDuring(fn) {
        if (!isEnabled) {
          isEnabled = true;
          fn();
          isEnabled = false;
        } else
          fn();
      }
    };
  }

  function MixMaster(options) {
    var hud = options.hud;
    var focused = options.focusedOverlay;
    var locale = options.locale || jQuery.locale;
    var commandManager = options.commandManager;
    var l10n = locale.scope('mix-master');
    var dialogPageMods = null;
    var transitionEffects;
    
    if (options.disableTransitionEffects)
      transitionEffects = NullTransitionEffectManager();
    else
      transitionEffects = TransitionEffectManager(commandManager);

    function updateStatus(verb, command) {
      var span = $('<span></span>');
      span.text(verb + ' ' + command.name + '.');
      $(hud.overlay).empty().append(span);
    }

    function runCommand(name, options) {
      focused.unfocus();
      var command = commandManager.run(name, options);
      updateStatus(locale.get('command-manager:executed'), command);
    }
    
    var self = {
      undo: function() {
        if (commandManager.canUndo()) {
          focused.unfocus();
          transitionEffects.enableDuring(function() {
            updateStatus(locale.get('command-manager:undid'),
                         commandManager.undo());
          });
        } else {
          var msg = locale.get('command-manager:cannot-undo-html');
          $(hud.overlay).html(msg);
        }
      },
      redo: function() {
        if (commandManager.canRedo()) {
          focused.unfocus();
          transitionEffects.enableDuring(function() {
            updateStatus(locale.get('command-manager:redid'),
                         commandManager.redo());
          });
        } else {
          var msg = locale.get('command-manager:cannot-redo-html');
          $(hud.overlay).html(msg);
        }
      },
      htmlToJQuery: function htmlToJQuery(html) {
        if (html == '' || typeof(html) != 'string')
          return $('<span></span>');
        if (html[0] != '<')
          html = '<span>' + html + '</span>';
        return $(html);
      },
      deleteFocusedElement: function deleteFocusedElement() {
        var elementToDelete = focused.getPrimaryElement();
        if (elementToDelete) {
          if ($(elementToDelete).is('html, body')) {
            var msg = l10n('too-big-to-change');
            jQuery.transparentMessage($('<div></div>').text(msg));
            return;
          }
          // Replacing the element with a zero-length invisible
          // span is a lot easier than actually deleting the element,
          // since it allows us to place a "bookmark" in the DOM
          // that can easily be undone if the user wishes.
          var placeholder = $('<span class="webxray-deleted"></span>');
          transitionEffects.enableDuring(function() {
            runCommand("ReplaceWithCmd", {
              name: l10n('deletion'),
              elementToReplace: elementToDelete,
              newContent: placeholder
            });
          });
        }
      },
      infoForFocusedElement: function infoForFocusedElement(open) {
        var element = focused.getPrimaryElement();
        open = open || window.open;
        if (element) {
          var url = 'https://developer.mozilla.org/en/HTML/Element/' +
                    element.nodeName.toLowerCase();
          open(url, 'info');
        }
      },
      replaceElement: function(elementToReplace, html) {
        var newContent = self.htmlToJQuery(html);
        runCommand("ReplaceWithCmd", {
          name: l10n('replacement'),
          elementToReplace: elementToReplace,
          newContent: newContent
        });
        return newContent;
      },
      setDialogPageMods: function(mods) {
        dialogPageMods = mods;
      },
      extractField: function(element) {
        delete($.webxraySettings.session.table); // get rid of pesky table
        var table = $.webxraySettings.session.field;
        console.log('table' + table);
        var focusedElement = focused.getPrimaryElement();
        $.webxraySettings.session.field = $(focusedElement).xpath(focusedElement.ownerDocument.body);
        console.log($.webxraySettings.session.field);
        var result = $(focusedElement).text();
      },
      showPaths: function() {
        var paths = $.webxraySettings.session;
        var pathsString = (JSON.stringify(paths));

        var uriContent = "data:application/octet-stream;filename=paths.json," + 
              encodeURIComponent(pathsString);
        newWindow=window.open(uriContent, 'paths.json');
      },
      extractTable: function(element) {
        delete($.webxraySettings.session.field);
        var focusedElement = element || focused.getPrimaryElement();
        if (!focusedElement)
          return;

        if (focusedElement.tagName != 'TABLE') {
          focusedElement = $(focusedElement).parents('table').first().get(0)

        }
        if(!focusedElement)
          return;
        
        focused.set(focusedElement);
        
        $.webxraySettings.session.table = $(focusedElement)
          .xpath(focusedElement.ownerDocument.body);
        $.webxraySettings.save();

        var result = $(focusedElement).find('tr').map(function() {
          var row = $(this).find('td').map(function() {
            if ($(this).attr('colspan')) { return []; }
            return '"' + this.innerText.trim().replace('"', '""') + '"';
          }).get();
          return [row];
        }).get();

        console.log(result);
        var csv = result.map(function (row) {
          return row.join(',');
        }).join('\n');
        return csv + '\n';
      },
      markPage: function() {
        var focusedElement = focused.getPrimaryElement();
        if (!focusedElement)
          return;

        var xpath = $(focusedElement).xpath(document.body);
        $.webxraySettings.session.page = xpath;
        $.webxraySettings.save();

        console.log(xpath);

        var href = document.location.href;
        console.log(href);
        while(focusedElement && focusedElement.tagName != 'A') {
          focusedElement = focusedElement.parentNode;
        }
        $.webxraySettings.session.page = $(focusedElement).filter('a')
          .xpath(focusedElement.ownerDocument.body)
        $.webxraySettings.save();
      },
      scrape: function () {
        jQuery.modalDialog({
          input: input,
          body: options.body,
          url: dialogURL,
          element: focusedElement,
          onLoad: function(dialog) {
            dialog.iframe.postMessage(JSON.stringify({
              languages: jQuery.locale.languages,
              startHTML: startHTML,
              mods: dialogPageMods,
              baseURI: document.location.href
            }), "*");
            console.log(options.body);
            dialog.iframe.fadeIn();
            dialog.iframe.bind("message", function onMessage(event, data) {
              if (data && data.length && data[0] == '{') {
                var data = JSON.parse(data);
                if (data.msg == "ok") {
                  // The dialog may have decided to replace all our spaces
                  // with non-breaking ones, so we'll undo that.
                  var html = data.endHTML.replace(/\u00a0/g, " ");
                  var newContent = self.replaceElement(focusedElement, html);

                  newContent.addClass('webxray-hidden');
                  $(focusedElement).removeClass('webxray-hidden');
                  jQuery.morphDialogIntoElement({
                    dialog: dialog,
                    input: input,
                    element: newContent,
                    onDone: function() {
                      newContent.reallyRemoveClass('webxray-hidden');
                    }
                  });
                } else {
                  // TODO: Re-focus previously focused elements?
                  $(focusedElement).reallyRemoveClass('webxray-hidden');
                  dialog.close();
                }
              }
            });
          }
        });
      },
      showSaveDialog: function(options) {
        var input = options.input;
        var dialogURL = options.dialogURL;

        var dialog = jQuery.modalDialog({
          input: input,
          body: options.body,
          url: dialogURL
        });

        dialog.iframe.one("load", function () {
          dialog.iframe.postMessage(JSON.stringify({
            languages: jQuery.locale.languages,
            csv: options.csv
          }), "*");
          dialog.iframe.fadeIn();
          dialog.iframe.bind("message", function onMessage(event, data) {
            dialog.close();
          });
        });
      }
    };
    return self;
  }

  jQuery.extend({mixMaster: MixMaster});
})(jQuery);
