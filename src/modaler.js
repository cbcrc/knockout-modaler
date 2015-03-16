define(['jquery', 'bootstrap', 'knockout', 'lodash', 'knockout-utilities'],
    function($, bootstrap, ko, _, koUtilities) {
        'use strict';

        var KEYCODE_ESC = 27;

        function Modaler() {
            var self = this;

            self.$document = $(document);

            koUtilities.registerComponent('modaler', {
                basePath: 'bower_components/knockout-modaler/src'
            });

            self.modalConfigs = [];
            self.currentModal = ko.observable(null);

            self.isModalOpen = ko.computed(function() {
                return !!self.currentModal();
            });

            self.focused = ko.observable(false);


            self.isModalOpen.subscribe(function(isModalOpen) {
                registerOrUnregisterHideModalKeyboardShortcut(self, isModalOpen);
            });

            self.currentModalTitle = ko.computed(function() {
                var currentModal = self.currentModal();

                if (currentModal) {
                    return currentModal.title;
                }

                return '';
            });

            self.isModalOpenening = ko.observable(false);
        }

        //TODO: Passer $modalElement en argument au lieu
        Modaler.prototype.init = function( /*config*/ ) {
            var self = this;

            self.$modalElement = getModalElement();

            self.$modalElement.modal({
                show: false
            });
        };

        Modaler.prototype.show = function(name, params, callback) {
            var self = this;

            if (arguments.length === 2) { // if only two arguments were supplied
                if (Object.prototype.toString.call(params) === '[object Function]') {
                    callback = params;
                    params = null;
                }
            }

            return new $.Deferred(function(dfd) {
                try {

                    if (self.isModalOpenening()) {
                        dfd.reject('wait for first modal to be shown before calling show again');
                    } else {
                        self.isModalOpenening(true);

                        isModalerReady(self).then(function() {
                            var modalConfigToShow = findByName(self.modalConfigs, name);

                            if (!modalConfigToShow) {
                                throw new Error('Modaler.show - Unregistered modal: ' + name);
                            }

                            var modal = {
                                settings: {
                                    close: function(data) {
                                        modal.data = data;
                                        return hideModal(self);
                                    },
                                    shown: ko.observable(false),
                                    params: params,
                                    title: modalConfigToShow.title
                                },
                                componentName: modalConfigToShow.componentName,
                                //TODO: On pourrait permettre d'overrider les settings de base (du registerModal) pour chaque affichage en passant backdrop & keyboard en plus a Modaler.prototype.show
                                backdrop: modalConfigToShow.backdrop,
                                keyboard: modalConfigToShow.keyboard
                            };

                            var currentModal = self.currentModal();

                            if (currentModal) {
                                currentModal.settings.close().then(function() {
                                    show(self, dfd, modal).always(callback);
                                });
                            } else {
                                show(self, dfd, modal).always(callback);
                            }
                        });
                    }
                } catch (err) {
                    dfd.reject(err);
                }
            }).promise();
        };

        Modaler.prototype.hideCurrentModal = function() {
            var self = this;
            return new $.Deferred(function(dfd) {
                try {
                    if (self.isModalOpenening()) {
                        var sub = self.isModalOpenening.subscribe(function() {
                            sub.dispose();
                            registerOrUnregisterHideModalKeyboardShortcut(self, false);
                            inner(self, dfd);
                        });
                    } else {
                        inner(self, dfd);
                    }
                } catch (err) {
                    dfd.reject(err);
                }
            }).promise();
        };

        function inner(self, dfd) {
            var currentModal = self.currentModal();

            if (currentModal) {
                currentModal.settings.close().then(function() {
                    dfd.resolve();
                });
            } else {
                dfd.resolve();
            }
        }

        Modaler.prototype.registerModal = function(name, modalConfig) {
            if (!name) {
                throw new Error('Modaler.registerModal - Argument missing exception: name');
            }

            modalConfig = modalConfig || {};
            modalConfig.name = name;

            var componentConfig = buildComponentConfigFromModalConfig(name, modalConfig);
            koUtilities.registerComponent(componentConfig.name, componentConfig);

            var finalModalConfig = applyModalConventions(name, modalConfig, componentConfig);

            this.modalConfigs.push(finalModalConfig);
        };

        Modaler.prototype.hideCurrentModalHandler = function(e) {
            var self = this;
            switch (e.keyCode) {
                case KEYCODE_ESC:
                    self.hideCurrentModal();
                    break;
            }
        };

        function registerOrUnregisterHideModalKeyboardShortcut(self, isModalOpen) {
            if ((isModalOpen && !self.currentModal().settings.params) || (isModalOpen && (self.currentModal().settings.params && !self.currentModal().settings.params.disableKeyEvents))) {
                self.$document.on('keydown', $.proxy(self.hideCurrentModalHandler, self));
            } else {
                self.$document.off('keydown', $.proxy(self.hideCurrentModalHandler, self));
            }
        }

        function isModalerReady(self) {
            return koUtilities.koBindingDone(self.$modalElement, null, null, true);
        }

        function buildComponentConfigFromModalConfig(name, modalConfig) {
            return {
                name: name + '-modal',
                htmlOnly: modalConfig.htmlOnly,
                basePath: modalConfig.basePath,
                isBower: modalConfig.isBower,
                type: 'modal'
            };
        }

        function applyModalConventions(name, modalConfig, componentConfig) {
            var finalModalConfig = $.extend({}, modalConfig);

            finalModalConfig.componentName = componentConfig.name;

            return finalModalConfig;
        }

        function show(self, deferred, modal) {
            return new $.Deferred(function(dfd) {
                try {
                    self.$modalElement.on('hidden.bs.modal', function( /*e*/ ) {
                        self.currentModal(null);
                        deferred.resolve(modal.data);
                    });

                    self.currentModal(modal);

                    self.$modalElement.removeData('bs.modal').modal({
                        backdrop: modal.backdrop,
                        keyboard: modal.keyboard,
                        show: true
                    });

                    if (!self.$modalElement.hasClass('in')) {
                        self.$modalElement.modal('show')
                            .on('shown.bs.modal', function( /*e*/ ) {
                                resolveShown(self, dfd);
                            });
                    } else {
                        resolveShown(self, dfd);
                    }
                } catch (err) {
                    self.isModalOpenening(false);
                    deferred.reject(err);
                    dfd.reject(err);
                }
            }).promise();
        }

        function resolveShown(self, dfd) {
            self.isModalOpenening(false);
            self.currentModal().settings.shown(true);

            self.focused(self.currentModal().settings.params && !self.currentModal().settings.params.preventFocus);

            dfd.resolve(self.$modalElement);            
        }

        function hideModal(self) {
            return new $.Deferred(function(dfd) {
                try {
                    if (self.$modalElement.hasClass('in')) {
                        self.$modalElement.modal('hide')
                            .on('hidden.bs.modal', function( /*e*/ ) {
                                dfd.resolve(self.$modalElement);
                            });
                    } else {
                        dfd.resolve(self.$modalElement);
                    }
                } catch (err) {
                    dfd.reject(err);
                }
            }).promise();
        }

        function getModalElement() {
            var $modalerElement = $('modaler');

            if ($modalerElement.length < 1) {
                throw new Error('Modaler.show - The modaler component is missing in the page.');
            }

            if ($modalerElement.length > 1) {
                throw new Error('Modaler.show - There must be only one instance of the modaler component in the page.');
            }

            return $modalerElement;
        }

        function findByName(collection, name) {
            var result = _.find(collection, function(obj) {
                return obj.name === name;
            });

            return result || null;
        }

        return new Modaler();
    });
