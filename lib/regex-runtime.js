let loading;

module.exports = {
  load() {
    return (loading ||= import("rregex")
      .then((namespace) => {
        if (typeof namespace.RRegex !== "function")
          throw new TypeError("Rust regex engine is unavailable");
        return namespace;
      })
      .catch((error) => {
        loading = null;
        throw error;
      }));
  },
};
