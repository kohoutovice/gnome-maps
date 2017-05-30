/* -*- Mode: JS2; indent-tabs-mode: nil; js2-basic-offset: 4 -*- */
/* vim: set et ts=4 sw=4: */
/*
 * Copyright (c) 2015 Marcus Lundblad
 *
 * GNOME Maps is free software; you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by the
 * Free Software Foundation; either version 2 of the License, or (at your
 * option) any later version.
 *
 * GNOME Maps is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY
 * or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU General Public License
 * for more details.
 *
 * You should have received a copy of the GNU General Public License along
 * with GNOME Maps; if not, write to the Free Software Foundation,
 * Inc., 51 Franklin St, Fifth Floor, Boston, MA  02110-1301  USA
 *
 * Author: Marcus Lundblad <ml@update.uu.se>
 */

const _ = imports.gettext.gettext;

const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const GnomeDesktop = imports.gi.GnomeDesktop;
const Gtk = imports.gi.Gtk;
const Lang = imports.lang;
const Soup = imports.gi.Soup;

const Application = imports.application;
const Maps = imports.gi.GnomeMaps;
const OSMConnection = imports.osmConnection;
const OSMTypes = imports.osmTypes;
const OSMTypeSearchEntry = imports.osmTypeSearchEntry;
const OSMUtils = imports.osmUtils;
const Utils = imports.utils;

const Response = {
    UPLOADED: 0,
    DELETED: 1,
    CANCELLED: 2,
    ERROR: 3
};

/*
 * enumeration representing
 * the different OSM editing
 * field types
 */
const EditFieldType = {
    TEXT: 0,
    INTEGER: 1,
    COMBO: 2,
    ADDRESS: 3
};

const _WIKI_BASE = 'https://wiki.openstreetmap.org/wiki/Key:';

let _osmWikipediaRewriteFunc = function(text) {
    let wikipediaArticleFormatted = OSMUtils.getWikipediaOSMArticleFormatFromUrl(text);

    /* if the entered text is a Wikipedia link,
     * substitute it with the OSM-formatted Wikipedia article tag */
    if (wikipediaArticleFormatted)
        return wikipediaArticleFormatted;
    else
        return text;
};

/* Reformat a phone number string if it looks like a tel: URI
 * strip off the leading tel: protocol string and trailing parameters,
 * following a ;
 * otherwise return the string unmodified */
let _osmPhoneRewriteFunc = function(text) {
    if (GLib.uri_parse_scheme(text) === 'tel') {
        let afterTel = text.replace('tel:', '');

        return Soup.uri_decode(afterTel.split(';')[0]);
    } else {
        return text;
    }
};

/*
 * specification of OSM edit fields
 * name: the label for the edit field (translatable)
 * tag: the OSM tag key value
 * type: the field type (determines editing field type)
 * rewriteFunc: a rewrite function taking a string argument
 * (only used for TEXT fields)
 * placeHolder: set a text place holder to act as example input
 * (only used for TEXT fields)
 * includeHelp: when true turn the name label to a link to the
 * OSM wiki for tags.
 * options: The options for the combo box (only used for COMBO fields)
 * hint: a hint text to show in a popover displayed by a hint button
 * (for TEXT and INTEGER fields)
 * subtags: Used by a complex composite OSM tag.
 * rows: Number of rows needed if != 1 (Currently only for ADDRESS).
 */
const OSM_FIELDS = [
    {
        name: _("Name"),
        tag: 'name',
        type: EditFieldType.TEXT,
        hint: _("The official name. This is typically what appears on signs.")
    },
    {
        name: _("Address"),
        tag: 'addr',
        subtags: ['addr:street', 'addr:housenumber',
                  'addr:postcode', 'addr:city'],
        type: EditFieldType.ADDRESS,
        rows: 2
    },
    {
        name: _("Website"),
        tag: 'website',
        type: EditFieldType.TEXT,
        hint: _("The official website. Try to use the most basic form " +
                "of a URL i.e. http://example.com instead of " +
                "http://example.com/index.html.")
    },
    {
        name: _("Phone"),
        tag: 'phone',
        type: EditFieldType.TEXT,
        rewriteFunc: this._osmPhoneRewriteFunc,
        hint: _("Phone number. Use the international format, " +
                "starting with a + sign. Beware of local privacy " +
                "laws, especially for private phone numbers.")
    },
    {
        name: _("Wikipedia"),
        tag: 'wikipedia',
        type: EditFieldType.TEXT,
        rewriteFunc: this._osmWikipediaRewriteFunc,
        hint: _("The format used should include the language code " +
                "and the article title like “en:Article title”.")
    },
    {
        name: _("Opening hours"),
        tag: 'opening_hours',
        type: EditFieldType.TEXT,
        placeHolder: 'Mo-Fr 08:00-20:00; Sa-Su 10:00-14:00',
        includeHelp: true,
        hint: _("See the link in the label for help on format.")
    },
    {
        name: _("Population"),
        tag: 'population',
        type: EditFieldType.INTEGER
    },
    {
        name: _("Altitude"),
        tag: 'ele',
        type: EditFieldType.INTEGER,
        hint: _("Elevation (height above sea level) of a point in metres.")
    },
    {
        name: _("Wheelchair access"),
        tag: 'wheelchair',
        type: EditFieldType.COMBO,
        options: [['yes', _("Yes")],
                  ['no', _("No")],
                  ['limited', _("Limited")],
                  ['designated', _("Designated")]]
    },
    {
        name: _("Internet access"),
        tag: 'internet_access',
        type: EditFieldType.COMBO,
        options: [['yes', _("Yes")],
                  ['no', _("No")],
                  ['wlan', _("Wi-Fi")],
                  ['wired', _("Wired")],
                  ['terminal', _("Terminal")],
                  ['service', _("Service")]]
    },
    {
        name: _("Religion"),
        tag: 'religion',
        type: EditFieldType.COMBO,
        options: [['animist', _("Animism")],
                  ['bahai', _("Bahá'í")],
                  ['buddhist', _("Buddhism")],
                  ['caodaism', _("Caodaism")],
                  ['christian', _("Christianity")],
                  ['confucian', _("Confucianism")],
                  ['hindu', _("Hinduism")],
                  ['jain', _("Jainism")],
                  ['jewish', _("Judaism")],
                  ['muslim', _("Islam")],
                  ['multifaith', _("Multiple Religions")],
                  ['pagan', _("Paganism")],
                  ['pastafarian', _("Pastafarianism")],
                  ['scientologist', _("Scientology")],
                  ['shinto', _("Shinto")],
                  ['sikh', _("Sikhism")],
                  ['spiritualist', _("Spiritualism")],
                  ['taoist', _("Taoism")],
                  ['unitarian_universalist', _("Unitarian Universalism")],
                  ['voodoo', _("Voodoo")],
                  ['yazidi', _("Yazidism")],
                  ['zoroastrian', _("Zoroastrianism")]]
    }];

const OSM_NAME_FIELDS = [
    {
        name: _("Alternative name"),
        tag: 'alt_name',
        type: EditFieldType.TEXT,
        hint: _("Alternative name by which the feature is known.")
    },
    {
        name: _("Old name"),
        tag: 'old_name',
        type: EditFieldType.TEXT,
        hint: _("Older or historical name.")
    },
    {
        name: _("English name"),
        tag: 'name:en',
        type: EditFieldType.TEXT,
        hint: _("Name of feature in English.")
    },
    {
        /* Translators: this placeholder string should be replaced by a string
         * representing the translated equivalent to "English name" where
         * "English" would be replaced by the name of the language translated
         * into. This tag will be targetted at the user's actual language.
         */
        name: _("name-in-localized-language"),
        tag: 'name:localized',
        type: EditFieldType.TEXT
    }];

const OSMEditAddress = new Lang.Class({
    Name: 'OSMEditAddress',
    Extends: Gtk.Grid,
    Template: 'resource:///org/gnome/Maps/ui/osm-edit-address.ui',
    Children: [ 'street',
                'number',
                'post',
                'city' ],

    _init: function(params) {
        let street = params.street;
        delete params.street;

        let number = params.number;
        delete params.number;

        let postCode = params.postCode;
        delete params.postCode;

        let city = params.city;
        delete params.city;

        this.parent(params);

        if (street)
            this.street.text = street;

        if (number)
            this.number.text = number;

        if (postCode)
            this.post.text = postCode;

        if (city)
            this.city.text = city;
    }
});


const OSMEditDialog = new Lang.Class({
    Name: 'OSMEditDialog',
    Extends: Gtk.Dialog,
    Template: 'resource:///org/gnome/Maps/ui/osm-edit-dialog.ui',
    InternalChildren: [ 'cancelButton',
                        'backButton',
                        'nextButton',
                        'stack',
                        'editorGrid',
                        'nameVariantsGrid',
                        'commentTextView',
                        'addFieldPopoverGrid',
                        'addFieldButton',
                        'typeSearchGrid',
                        'typeLabel',
                        'typeButton',
                        'typeValueLabel',
                        'recentTypesLabel',
                        'recentTypesListBox',
                        'hintPopover',
                        'hintLabel',
                        'headerBar'],

    _init: function(params) {
        this._place = params.place;
        delete params.place;

        this._addLocation = params.addLocation;
        delete params.addLocation;

        this._latitude = params.latitude;
        delete params.latitude;

        this._longitude = params.longitude;
        delete params.longitude;

        /* This is a construct-only property and cannot be set by GtkBuilder */
        params.use_header_bar = true;

        this.parent(params);

        /* I could not get this widget working from within the widget template
         * this results in a segfault. The widget definition is left in-place,
         * but commented-out in the template file */
        this._typeSearch = new OSMTypeSearchEntry.OSMTypeSearchEntry();
        this._typeSearchGrid.attach(this._typeSearch, 0, 0, 1, 1);
        this._typeSearch.visible = true;
        this._typeSearch.can_focus = true;

        let typeSearchPopover = this._typeSearch.popover;
        typeSearchPopover.connect('selected', this._onTypeSelected.bind(this));

        this._cancellable = new Gio.Cancellable();
        this._cancellable.connect((function() {
            this.response(Response.CANCELLED);
        }).bind(this));

        this.connect('delete-event', (function() {
            this._cancellable.cancel();
        }).bind(this));

        this._isEditing = false;
        this._nextButton.connect('clicked', this._onNextClicked.bind(this));
        this._cancelButton.connect('clicked', this._onCancelClicked.bind(this));
        this._backButton.connect('clicked', this._onBackClicked.bind(this));
        this._typeButton.connect('clicked', this._onTypeClicked.bind(this));

        if (this._addLocation) {
            this._headerBar.title = C_("dialog title", "Add to OpenStreetMap");
            this._typeLabel.visible = true;
            this._typeButton.visible = true;

            /* the OSMObject ID, version, and changeset ID is unknown for now */
            let newNode =
                Maps.OSMNode.new(0, 0, 0, this._longitude, this._latitude);
            /* set a placeholder name tag to always get a name entry for new
             * locations */
            newNode.set_tag('name', '');
            this._loadOSMData(newNode);
            this._isEditing = true;
        } else {
            this._osmType = this._place.osmType;
            Application.osmEdit.fetchObject(this._place,
                                            this._onObjectFetched.bind(this),
                                            this._cancellable);
        }

        /* store original title of the dialog to be able to restore it when
         * coming back from type selection */
        this._originalTitle = this._headerBar.title;
        this._updateRecentTypesList();

        this._recentTypesListBox.set_header_func(function (row, previous) {
            if (previous)
                row.set_header(new Gtk.Separator());
        });

        this._recentTypesListBox.connect('row-activated', (function(listbox, row) {
            this._onTypeSelected(null, row._key, row._value, row._title);
        }).bind(this));
    },

    _onNextClicked: function() {
        if (this._isEditing) {
            this._switchToUpload();
        } else {
            this._stack.visible_child_name = 'loading';
            this._nextButton.sensitive = false;
            this._backButton.sensitive = false;

            let comment = this._commentTextView.buffer.text;
            Application.osmEdit.uploadObject(this._osmObject,
                                             this._osmType, comment,
                                             this._onObjectUploaded.bind(this));
        }
    },

    _onTypeClicked: function() {
        this._cancelButton.visible = false;
        this._backButton.visible = true;
        this._nextButton.visible = false;
        this._headerBar.title = _("Select Type");
        this._stack.visible_child_name = 'select-type';
    },

    _onTypeSelected: function(popover, key, value, title) {
        this._typeValueLabel.label = title;
        this._updateType(key, value);

        if (popover)
            popover.hide();

        /* clear out type search entry */
        this._typeSearch.text = '';

        /* go back to the editing stack page */
        this._backButton.visible = false;
        this._cancelButton.visible = true;
        this._nextButton.visible = true;
        this._stack.visible_child_name = 'editor';
        this._headerBar.title = this._originalTitle;

        /* update recent types store */
        OSMTypes.recentTypesStore.pushType(key, value);

        /* enable the Next button, so that it's possible to just change the type
         * of an object without changing anything else */
        this._nextButton.sensitive = true;

        this._updateRecentTypesList();
    },

    _updateType: function(key, value) {
        /* clear out any previous type-related OSM tags */
        OSMTypes.OSM_TYPE_TAGS.forEach((function (tag) {
            this._osmObject.delete_tag(tag);
        }).bind(this));

        this._osmObject.set_tag(key, value);
    },

    /* update visibility and enable the type selection button if the object has
     * a well-known type (based on a known set of tags) */
    _updateTypeButton: function() {
        let numTypeTags = 0;
        let lastTypeTag = null;

        for (let i = 0; i < OSMTypes.OSM_TYPE_TAGS.length; i++) {
            let key = OSMTypes.OSM_TYPE_TAGS[i];
            let value = this._osmObject.get_tag(key);

            if (value != null) {
                numTypeTags++;
                lastTypeTag = key;
            }
        }

        /* if the object has none of tags set, enable the button and keep the
         * pre-set "None" label */
        if (numTypeTags === 0) {
            this._typeLabel.visible = true;
            this._typeButton.visible = true;
        } else if (numTypeTags === 1) {
            let value = this._osmObject.get_tag(lastTypeTag);
            let typeTitle = OSMTypes.lookupType(lastTypeTag, value);

            /* if the type tag has a value we know of, and possible has
             * translations for */
            if (typeTitle != null) {
                this._typeValueLabel.label = typeTitle;
                this._typeLabel.visible = true;
                this._typeButton.visible = true;
            }
        }
    },

    _updateRecentTypesList: function() {
        let recentTypes = OSMTypes.recentTypesStore.recentTypes;

        if (recentTypes.length > 0) {
            let children = this._recentTypesListBox.get_children();

            for (let i = 0; i < children.length; i++) {
                children[i].destroy();
            }

            this._recentTypesLabel.visible = true;
            this._recentTypesListBox.visible = true;

            for (let i = 0; i < recentTypes.length; i++) {
                let key = recentTypes[i].key;
                let value = recentTypes[i].value;
                let title = OSMTypes.lookupType(key, value);

                let row = new Gtk.ListBoxRow({visible: true, hexpand: true});
                let grid = new Gtk.Grid({visible: true,
                                         margin_top: 6, margin_bottom: 6,
                                         margin_start: 12, margin_end: 12});
                let label = new Gtk.Label({visible: true, halign: Gtk.Align.START,
                                           label: title});

                label.get_style_context().add_class('dim-label');

                row._title = title;
                row._key = key;
                row._value = value;

                row.add(grid);
                grid.add(label);

                this._recentTypesListBox.add(row);
            }
        } else {
            this._recentTypesLabel.visible = false;
            this._recentTypesListBox.visible = false;
        }
    },

    _switchToUpload: function() {
        this._stack.set_visible_child_name('upload');
        this._nextButton.label = _("Done");
        this._cancelButton.visible = false;
        this._backButton.visible = true;
        this._cancelButton.visible = false;
        this._isEditing = false;
    },

    _onCancelClicked: function() {
        this.response(Response.CANCELLED);
    },

    _onBackClicked: function() {
        this._backButton.visible = false;
        this._cancelButton.visible = true;
        this._nextButton.visible = true;
        this._nextButton.label = _("Next");
        this._stack.set_visible_child_name('editor');
        this._isEditing = true;
        this._commentTextView.buffer.text = '';
        this._typeSearch.text = '';
        this._headerBar.title = this._originalTitle;
    },

    _onObjectFetched: function(success, status, osmObject, osmType, error) {
        if (success) {
            this._isEditing = true;
            this._loadOSMData(osmObject);
        } else {
            this._showError(status, error);
        }
    },

    _onObjectUploaded: function(success, status) {
        if (success) {
            this.response(Response.UPLOADED);
        } else {
            this._showError(status);
            this.response(Response.ERROR);
        }
    },

    _showError: function(status, error) {
        /* set error message from specific error if available, otherwise use
         * a generic error message for the HTTP status code */
        let statusMessage =
            error ? error.message : OSMConnection.getStatusMessage(status);
        let messageDialog =
            new Gtk.MessageDialog({ transient_for: this.get_toplevel(),
                                    destroy_with_parent: true,
                                    message_type: Gtk.MessageType.ERROR,
                                    buttons: Gtk.ButtonsType.OK,
                                    modal: true,
                                    text: _("An error has occurred"),
                                    secondary_text: statusMessage });

        messageDialog.run();
        messageDialog.destroy();
        this.response(Response.ERROR);
    },

    /* GtkContainer.child_get_property doesn't seem to be usable from GJS */
    _getRowOfDeleteButton: function(button) {
        for (let row = 1; row < this._currentRow; row++) {
            let label = this._editorGrid.get_child_at(0, row);
            let deleteButton = this._editorGrid.get_child_at(2, row);

            if (deleteButton === button)
                return row;
        }

        return -1;
    },

    _addOSMEditDeleteButton: function(fieldSpec) {
        let deleteButton = Gtk.Button.new_from_icon_name('user-trash-symbolic',
                                                         Gtk.IconSize.BUTTON);
        let styleContext = deleteButton.get_style_context();
        let rows = fieldSpec.rows || 1;

        styleContext.add_class('flat');
        this._editorGrid.attach(deleteButton, 2, this._currentRow, 1, 1);

        deleteButton.connect('clicked', (function() {
            if (fieldSpec.subtags) {
                fieldSpec.subtags.forEach((function(key) {
                    this._osmObject.delete_tag(key);
                }).bind(this));
            } else {
                this._osmObject.delete_tag(fieldSpec.tag);
            }

            let row = this._getRowOfDeleteButton(deleteButton);
            for (let i = 0; i < rows; i++) {
                this._editorGrid.remove_row(row);
                this._currentRow--;
            }
            this._nextButton.sensitive = true;
            this._updateAddFieldMenu();
        }).bind(this));

        deleteButton.show();
    },

    _onNameVariantsClicked: function() {
        this._cancelButton.visible = false;
        this._backButton.visible = true;
        this._nextButton.visible = false;
        this._headerBar.title = _("Edit Name Variants");
        this._stack.visible_child_name = 'name-variants';
    },

    _addOSMEditNameVariantsButton: function() {
        let nameVariantsButton = Gtk.Button.new_from_icon_name('go-next-symbolic',
                                                               Gtk.IconSize.BUTTON);
        let styleContext = nameVariantsButton.get_style_context();

        nameVariantsButton.tooltip_text = _("Edit name variants");
        styleContext.add_class('flat');
        this._editorGrid.attach(nameVariantsButton, 2, this._currentRow, 1, 1);

        nameVariantsButton.connect('clicked', (function() {
            this._onNameVariantsClicked();
        }).bind(this));

        nameVariantsButton.show();
    },

    _createOSMEditLabel: function(fieldSpec) {
        let text = fieldSpec.name;
        if (fieldSpec.includeHelp) {
            let link = _WIKI_BASE + fieldSpec.tag;
            text = '<a href="%s" title="%s">%s</a>'.format(link, link, text);
        }
        let label = new Gtk.Label({ label: text,
                                    use_markup: true });
        label.halign = Gtk.Align.END;
        label.get_style_context().add_class('dim-label');

        return label;
    },

    _addOSMEditNameVariantLabel: function(fieldSpec, row) {
        let label = this._createOSMEditLabel(fieldSpec);

        this._nameVariantsGrid.attach(label, 0, row, 1, 1);
        label.show();
    },

    _addOSMEditLabel: function(fieldSpec) {
        let label = this._createOSMEditLabel(fieldSpec);

        this._editorGrid.attach(label, 0, this._currentRow, 1, 1);
        label.show();
    },

    _showHintPopover: function(entry, hint) {
        this._hintPopover.visible = !this._hintPopover.visible;
        if (this._hintPopover.visible) {
            this._hintPopover.relative_to = entry;
            this._hintLabel.label = hint;
            this._hintPopover.visible = true;
        }
    },

    _createOSMEditTextEntry: function(fieldSpec, value) {
        let entry = new Gtk.Entry();

        if (value)
            entry.text = value;

        entry.hexpand = true;
        if (fieldSpec.placeHolder)
            entry.placeholder_text = fieldSpec.placeHolder;

        entry.connect('changed', (function() {
            if (fieldSpec.rewriteFunc)
                entry.text = fieldSpec.rewriteFunc(entry.text);
            this._osmObject.set_tag(fieldSpec.tag, entry.text);
            this._nextButton.sensitive = true;
        }).bind(this));

        if (fieldSpec.hint) {
            entry.secondary_icon_name = 'dialog-information-symbolic';
            entry.connect('icon-press', (function(entry, iconPos, event) {
                this._showHintPopover(entry, fieldSpec.hint);
            }).bind(this));
        }

        return entry;
    },

    _addOSMEditNameVariantTextEntry: function(fieldSpec, value, row) {
        let entry = this._createOSMEditTextEntry(fieldSpec, value);

        this._addOSMEditNameVariantLabel(fieldSpec, row);
        this._nameVariantsGrid.attach(entry, 1, row, 1, 1);
        entry.show();
    },

    _addOSMEditTextEntry: function(fieldSpec, value) {
        let entry = this._createOSMEditTextEntry(fieldSpec, value);

        this._addOSMEditLabel(fieldSpec);
        this._editorGrid.attach(entry, 1, this._currentRow, 1, 1);
        entry.show();

        if (fieldSpec.tag === 'name')
            this._addOSMEditNameVariantsButton();
        else
            this._addOSMEditDeleteButton(fieldSpec);

        this._currentRow++;
    },

    _addOSMEditIntegerEntry: function(fieldSpec, value) {
        this._addOSMEditLabel(fieldSpec);

        let spinbutton = Gtk.SpinButton.new_with_range(0, 1e9, 1);
        spinbutton.value = value;
        spinbutton.numeric = true;
        spinbutton.hexpand = true;
        spinbutton.connect('changed', (function() {
            this._osmObject.set_tag(fieldSpec.tag, spinbutton.text);
            this._nextButton.sensitive = true;
        }).bind(this, fieldSpec.tag, spinbutton));

        if (fieldSpec.hint) {
            spinbutton.secondary_icon_name = 'dialog-information-symbolic';
            spinbutton.connect('icon-press', (function(iconPos, event) {
                this._showHintPopover(spinbutton, fieldSpec.hint);
            }).bind(this));
        }

        this._editorGrid.attach(spinbutton, 1, this._currentRow, 1, 1);
        spinbutton.show();

        this._addOSMEditDeleteButton(fieldSpec);
        this._currentRow++;
    },

    _addOSMEditComboEntry: function(fieldSpec, value) {
        this._addOSMEditLabel(fieldSpec);

        let combobox = new Gtk.ComboBoxText();

        fieldSpec.options.forEach(function(option) {
            combobox.append(option[0], option[1]);
        });
        combobox.active_id = value;
        combobox.hexpand = true;
        combobox.connect('changed', (function() {
        this._osmObject.set_tag(fieldSpec.tag, combobox.active_id);
            this._nextButton.sensitive = true;
        }).bind(this, fieldSpec.tag, combobox));

        this._editorGrid.attach(combobox, 1, this._currentRow, 1, 1);
        combobox.show();

        this._addOSMEditDeleteButton(fieldSpec);
        this._currentRow++;
    },

    _addOSMEditAddressEntry: function(fieldSpec, value) {
        this._addOSMEditLabel(fieldSpec);

        let addr = new OSMEditAddress({ street: value[0],
                                        number: value[1],
                                        postCode: value[2],
                                        city: value[3] });
        let changedFunc = (function(entry, index) {
            this._osmObject.set_tag(fieldSpec.subtags[index], entry.text);
            this._nextButton.sensitive = true;
        }).bind(this);

        addr.street.connect('changed', changedFunc.bind(this, addr.street, 0));
        addr.number.connect('changed', changedFunc.bind(this, addr.number, 1));
        addr.post.connect('changed', changedFunc.bind(this, addr.post, 2));
        addr.city.connect('changed', changedFunc.bind(this, addr.city, 3));

        let rows = fieldSpec.rows || 1;
        this._editorGrid.attach(addr, 1, this._currentRow, 1, rows);
        this._addOSMEditDeleteButton(fieldSpec);
        this._currentRow += rows;
    },

    /* update visible items in the "Add Field" popover */
    _updateAddFieldMenu: function() {
        /* clear old items */
        let children = this._addFieldPopoverGrid.get_children();
        let hasAllFields = true;

        for (let i = 0; i < children.length; i++) {
            let button = children[i];
            button.destroy();
        }

        /* add selectable items */
        for (let i = 0; i < OSM_FIELDS.length; i++) {
            let fieldSpec = OSM_FIELDS[i];
            let hasValue = false;

            if (fieldSpec.subtags) {
                fieldSpec.subtags.forEach((function(tag) {
                    if (this._osmObject.get_tag(tag))
                        hasValue = true;
                }).bind(this));
            } else {
                hasValue = this._osmObject.get_tag(fieldSpec.tag) !== null;
            }

            if (!hasValue) {
                let button = new Gtk.Button({
                    visible: true, sensitive: true,
                    label: fieldSpec.name
                });
                button.get_style_context().add_class('menuitem');
                button.get_style_context().add_class('button');
                button.get_style_context().add_class('flat');
                button.get_child().halign = Gtk.Align.START;

                button.connect('clicked', (function() {
                    this._addFieldButton.active = false;
                    this._addOSMField(fieldSpec, '');
                    /* add a "placeholder" empty OSM tag to keep the add field
                     * menu updated, these tags will be filtered out if nothing
                     * is entered */
                    if (fieldSpec.subtags) {
                        fieldSpec.subtags.forEach((function(tag) {
                            this._osmObject.set_tag(tag, '');
                        }).bind(this));
                    } else {
                        this._osmObject.set_tag(fieldSpec.tag, '');
                    }
                    this._updateAddFieldMenu();
                }).bind(this));

                hasAllFields = false;
                this._addFieldPopoverGrid.add(button);
            }
        }

        this._addFieldButton.sensitive = !hasAllFields;
    },

    _addOSMField: function(fieldSpec, value) {
        switch (fieldSpec.type) {
        case EditFieldType.TEXT:
            this._addOSMEditTextEntry(fieldSpec, value);
            break;
        case EditFieldType.INTEGER:
            this._addOSMEditIntegerEntry(fieldSpec, value);
            break;
        case EditFieldType.COMBO:
            this._addOSMEditComboEntry(fieldSpec, value);
            break;
        case EditFieldType.ADDRESS:
            this._addOSMEditAddressEntry(fieldSpec, value);
            break;
        }
    },

    /* Get a localized title for the "name in user's language" item,
     * generate it programmatically if no translation is available
     */
    _getLocalizedNameTitle: function(title, language) {
        Utils.debug('get localized name for: ' + language);
        if (title === 'name-in-localized-language')
            return GnomeDesktop.get_language_from_locale(language, 'C') + ' name';
        else
            return title;
    },

    _loadOSMData: function(osmObject) {
        this._osmObject = osmObject;

        /* keeps track of the current insertion row in the grid for editing
         * widgets */
        this._currentRow = 1;

        for (let i = 0; i < OSM_FIELDS.length; i++) {
            let fieldSpec = OSM_FIELDS[i];
            let value;

            if (fieldSpec.subtags) {
                let hasAny = false;
                fieldSpec.subtags.forEach(function(tag) {
                    if (osmObject.get_tag(tag) != null)
                        hasAny = true;
                });

                if (hasAny) {
                    value = fieldSpec.subtags.map(function(tag) {
                        return osmObject.get_tag(tag);
                    });
                    this._addOSMField(fieldSpec, value);
                }
            } else {
                value = osmObject.get_tag(fieldSpec.tag);
                if (value != null)
                    this._addOSMField(fieldSpec, value);
            }
        }

        for (let i = 0; i < OSM_NAME_FIELDS.length; i++) {
            let fieldSpec = OSM_NAME_FIELDS[i];

            if (fieldSpec.type === EditFieldType.TEXT) {
                // special handling for the locale-dependent name tag
                if (fieldSpec.tag === 'name:localized') {
                    let language = OSMUtils.getLanguageCode();

                    if (language === 'en' || language === 'C') {
                        /* skip the localized name for English (or fallback) locale
                         * since we already have a hard-coded English name
                         */
                        continue;
                    } else {
                        // re-write the field-spec
                        fieldSpec.tag = 'name:' + language;
                        fieldSpec.name = this._getLocalizedNameTitle(fieldSpec.name,
                                                                     language);
                    }
                }
                let value = osmObject.get_tag(fieldSpec.tag);

                this._addOSMEditNameVariantTextEntry(fieldSpec, value, i);
            } else {
                Utils.debug('Only simple text input fields are supported for name variants');
            }
        }

        this._updateAddFieldMenu();
        this._updateTypeButton();
        this._stack.visible_child_name = 'editor';
    }
});
