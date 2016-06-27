function isRadio(avTransportUri) {
    const uri = (typeof avTransportUri !== 'undefined') ? avTransportUri : this.avTransportUri;

    return uri.startsWith('x-sonosapi-stream:') ||
        uri.startsWith('x-sonosapi-radio:') ||
        uri.startsWith('pndrradio:') ||
        uri.startsWith('x-sonosapi-hls:') ||
        uri.startsWith('x-sonosprog-http:');
}

module.exports = isRadio;
