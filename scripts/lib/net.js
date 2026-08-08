'use strict';
/*
 * Prefer IPv4.
 *
 * A run died twice with getaddrinfo ENOTFOUND and read ECONNRESET partway
 * through fetching stock footage, on a machine where pixabay.com resolved fine
 * from the shell. The cause: Node returns the AAAA records first, and that
 * IPv6 path drops connections once a render starts pulling clips in bursts.
 * Every host this project talks to publishes A records, so asking for IPv4
 * first is safe and removes the whole failure mode.
 *
 * Require this once per process, before anything opens a socket.
 */
require('dns').setDefaultResultOrder('ipv4first');
