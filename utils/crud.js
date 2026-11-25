const express = require('express');

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Wrap async handlers so errors reach the central error handler
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Only accept whitelisted fields from a request body
const pick = (body = {}, fields) =>
  Object.fromEntries(fields.filter((f) => body[f] !== undefined).map((f) => [f, body[f]]));

/**
 * Builds a router with the standard CRUD endpoints for a Mongoose model.
 *   fields       – fields a client may set
 *   filters      – query-string keys allowed as exact-match filters (e.g. ?elder=<id>)
 *   search       – fields matched by ?search=
 *   sort         – default sort order
 *   populate     – populate option for responses
 *   extraQuery   – (req) => extra Mongo filter
 *   beforeDelete – async (doc) => cleanup of related data before a permanent delete
 *   extend       – (router) => add custom routes (registered before /:id)
 *   trash          – { retentionDays } enables a trash: DELETE moves items to the trash
 *                  (model needs a `deletedAt` field) and adds:
 *                    GET    /trash               list items in the trash
 *                    DELETE /trash               empty the trash (respects filters)
 *                    POST   /:id/restore       restore an item
 *                    DELETE /:id/permanent     delete an item forever
 */
function crudRouter(Model, opts) {
  const {
    fields,
    filters = [],
    search = [],
    sort = { createdAt: -1 },
    populate,
    extraQuery,
    beforeDelete,
    extend,
    trash,
  } = opts;
  const router = express.Router();
  const name = Model.modelName;
  const notFound = () => new HttpError(404, `${name} not found`);
  const withPopulate = (q) => (populate ? q.populate(populate) : q);
  const alive = trash ? { deletedAt: null } : {}; // matches null or missing
  const inTrash = { deletedAt: { $ne: null } };

  const listFilter = (req) => {
    const q = extraQuery ? { ...extraQuery(req) } : {};
    for (const f of filters) if (req.query[f]) q[f] = String(req.query[f]);
    if (req.query.search && search.length) {
      const rx = new RegExp(escapeRegex(req.query.search), 'i');
      q.$or = search.map((f) => ({ [f]: rx }));
    }
    return q;
  };

  const destroy = async (doc) => {
    if (beforeDelete) await beforeDelete(doc);
    await doc.deleteOne();
  };

  if (extend) extend(router);

  if (trash) {
    const cutoff = () => new Date(Date.now() - trash.retentionDays * 864e5);

    // Permanently remove items that have been in the trash longer than the retention period
    const purgeExpired = async () => {
      const expired = await Model.find({ deletedAt: { $ne: null, $lt: cutoff() } });
      for (const doc of expired) await destroy(doc);
    };

    router.get(
      '/trash',
      wrap(async (req, res) => {
        await purgeExpired();
        const items = await Model.find({ ...listFilter(req), ...inTrash })
          .sort({ deletedAt: -1 })
          .populate(trash.populate || []);
        res.json(
          items.map((d) => ({
            ...d.toJSON(),
            purgeAt: new Date(d.deletedAt.getTime() + trash.retentionDays * 864e5),
          }))
        );
      })
    );

    router.delete(
      '/trash',
      wrap(async (req, res) => {
        const items = await Model.find({ ...listFilter(req), ...inTrash });
        for (const doc of items) await destroy(doc);
        res.json({ message: `Trash emptied`, deleted: items.length });
      })
    );

    router.post(
      '/:id/restore',
      wrap(async (req, res) => {
        const doc = await Model.findOneAndUpdate({ _id: req.params.id, ...inTrash }, { deletedAt: null }, { new: true });
        if (!doc) throw new HttpError(404, `${name} not found in the trash`);
        res.json(populate ? await doc.populate(populate) : doc);
      })
    );

    router.delete(
      '/:id/permanent',
      wrap(async (req, res) => {
        const doc = await Model.findOne({ _id: req.params.id, ...inTrash });
        if (!doc) throw new HttpError(404, `${name} not found in the trash`);
        await destroy(doc);
        res.json({ message: `${name} permanently deleted` });
      })
    );
  }

  // READ (list)
  router.get(
    '/',
    wrap(async (req, res) => {
      let query = Model.find({ ...listFilter(req), ...alive }).sort(sort);
      const limit = parseInt(req.query.limit, 10);
      if (limit > 0) query = query.limit(Math.min(limit, 500));
      res.json(await withPopulate(query));
    })
  );

  // READ (one)
  router.get(
    '/:id',
    wrap(async (req, res) => {
      const doc = await withPopulate(Model.findOne({ _id: req.params.id, ...alive }));
      if (!doc) throw notFound();
      res.json(doc);
    })
  );

  // CREATE
  router.post(
    '/',
    wrap(async (req, res) => {
      const doc = await Model.create(pick(req.body, fields));
      res.status(201).json(populate ? await doc.populate(populate) : doc);
    })
  );

  // UPDATE – load, change and save, so every schema validator and hook runs (same rules as create)
  router.put(
    '/:id',
    wrap(async (req, res) => {
      const doc = await Model.findOne({ _id: req.params.id, ...alive });
      if (!doc) throw notFound();
      doc.set(pick(req.body, fields));
      await doc.save();
      res.json(populate ? await doc.populate(populate) : doc);
    })
  );

  // DELETE – moves to the trash when enabled, otherwise deletes permanently
  router.delete(
    '/:id',
    wrap(async (req, res) => {
      const doc = await Model.findOne({ _id: req.params.id, ...alive });
      if (!doc) throw notFound();
      if (trash) {
        await Model.updateOne({ _id: doc._id }, { deletedAt: new Date() });
        return res.json({ message: `${name} moved to the trash`, trashed: true });
      }
      await destroy(doc);
      res.json({ message: `${name} deleted` });
    })
  );

  return router;
}

module.exports = { crudRouter, wrap, pick, HttpError, escapeRegex };
