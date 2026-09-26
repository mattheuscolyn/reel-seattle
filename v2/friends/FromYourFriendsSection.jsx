/**
 * Film Detail — secondary "From your friends" section.
 * Renders nothing when there is no friend activity.
 */
export default function FromYourFriendsSection({ presentation = null }) {
  if (!presentation?.lines?.length) return null;

  return (
    <section
      className="v2-fd-section v2-fd-friends"
      aria-labelledby="v2-fd-friends-h"
      data-fd-slot="from-your-friends"
    >
      <div className="v2-fd-section-head">
        <h2 id="v2-fd-friends-h" className="v2-section-caps">
          {presentation.title}
        </h2>
      </div>
      <ul className="v2-fd-friends-lines" role="list">
        {presentation.lines.map((line) => (
          <li
            key={line.id}
            className="v2-fd-friends-line"
            data-friend-state={line.state}
          >
            {line.text}
          </li>
        ))}
      </ul>
    </section>
  );
}
