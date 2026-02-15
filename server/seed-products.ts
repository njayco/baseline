import { getUncachableStripeClient } from './stripeClient';

async function createProducts() {
  const stripe = await getUncachableStripeClient();

  const existing = await stripe.products.search({ query: "name:'Baseline MusicXML Export'" });
  if (existing.data.length > 0) {
    console.log('Products already exist, skipping creation.');
    console.log('MusicXML product:', existing.data[0].id);
    const midiProducts = await stripe.products.search({ query: "name:'Baseline MIDI Export'" });
    if (midiProducts.data.length > 0) {
      console.log('MIDI product:', midiProducts.data[0].id);
    }
    return;
  }

  const musicxmlProduct = await stripe.products.create({
    name: 'Baseline MusicXML Export',
    description: 'Export your transcribed melody as a MusicXML file for use in Finale, MuseScore, Sibelius, and other notation software.',
    metadata: {
      format: 'musicxml',
      app: 'baseline',
    },
  });

  const musicxmlPrice = await stripe.prices.create({
    product: musicxmlProduct.id,
    unit_amount: 99,
    currency: 'usd',
  });

  console.log('Created MusicXML product:', musicxmlProduct.id);
  console.log('Created MusicXML price:', musicxmlPrice.id, '($0.99)');

  const midiProduct = await stripe.products.create({
    name: 'Baseline MIDI Export',
    description: 'Export your transcribed melody as a MIDI file for use in any DAW or music production software.',
    metadata: {
      format: 'midi',
      app: 'baseline',
    },
  });

  const midiPrice = await stripe.prices.create({
    product: midiProduct.id,
    unit_amount: 199,
    currency: 'usd',
  });

  console.log('Created MIDI product:', midiProduct.id);
  console.log('Created MIDI price:', midiPrice.id, '($1.99)');
}

createProducts().catch(console.error);
