import styles from "../../css/CabinetPage.module.css";

export default function FeatureDeckSection({ signals }) {
  return (
    <section className={styles.featureDeck}>
      {signals.map((item) => (
        <article key={item.title} className={styles.featureDeckCard}>
          <h2 className={styles.featureDeckTitle}>{item.title}</h2>
          <p className={styles.featureDeckText}>{item.text}</p>
        </article>
      ))}
    </section>
  );
}
