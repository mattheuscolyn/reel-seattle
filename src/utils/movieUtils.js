export function moviesFromRows(rows) {
  const moviesMap = rows.reduce((acc, row) => {
    if (!acc[row.Film]) {
      acc[row.Film] = {
        film: row.Film,
        runtime: row.Runtime,
        poster: row.posterDynamic,
      };
    }
    return acc;
  }, {});
  return Object.values(moviesMap);
}

export function getMoviePopularity(rows, filmName) {
  return rows.filter((row) => row.Film === filmName).length;
}
