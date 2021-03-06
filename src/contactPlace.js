/* -*- Mode: JS2; indent-tabs-mode: nil; js2-basic-offset: 4 -*- */
/* vim: set et ts=4 sw=4: */
/*
 * Copyright (c) 2015 Jonas Danielsson
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
 * with GNOME Maps; if not, see <http://www.gnu.org/licenses/>.
 *
 * Author: Jonas Danielsson <jonas@threetimestwo.org>
 */

const Lang = imports.lang;

const Place = imports.place;

const ContactPlace = new Lang.Class({
    Name: 'ContactPlace',
    Extends: Place.Place,

    _init: function(params) {
        this._contact = params.contact;
        delete params.contact;

        params.store = false;
        this.parent(params);
    },

    get icon() {
        return this._contact.icon;
    },

    get uniqueID() {
        return [this.name,
                this.osm_type,
                this.osm_id].join('-');
    }
});
