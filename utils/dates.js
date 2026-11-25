const DATE_RX = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const TIME_RX = /^([01]\d|2[0-3]):[0-5]\d$/;

// Local calendar date as YYYY-MM-DD
const localToday = () => new Date().toLocaleDateString('en-CA');

// Use the client's date if valid (clients send their local date), otherwise the server's
const resolveDate = (d) => (typeof d === 'string' && DATE_RX.test(d) ? d : localToday());

module.exports = { DATE_RX, TIME_RX, localToday, resolveDate };
