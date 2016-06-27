function isLineIn(avTransportUri) {
    const uri = (typeof avTransportUri !== 'undefined') ? avTransportUri : this.avTransportUri;

    return uri.startsWith('x-rincon-stream:');
}

module.exports = isLineIn;
