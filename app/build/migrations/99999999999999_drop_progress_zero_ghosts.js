// mediaocd: one-shot cleanup of progress=0 ghost rows. These were created
// pre-PROGRESS_ZERO_DELETE_V1 by the Rp modal save / Marcar-como-completado
// / Quitar-completado flows. Equivalent to absence-of-row semantically.
exports.up = async function (knex) {
  try {
    await knex('progress').where('progress', 0).delete();
  } catch (_) { /* swallow — not load-bearing for app boot */ }
};
exports.down = async function () { /* no-op */ };
