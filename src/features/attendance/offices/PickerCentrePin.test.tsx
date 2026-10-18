/**
 * PickerCentrePin chip text (UX finding 22): "set" until a pin exists,
 * "move" once it does; hidden while dragging or when the map failed.
 */
import { act, create } from 'react-test-renderer';
import { Text } from 'react-native';
import PickerCentrePin from './PickerCentrePin';

async function chipTexts(props: Partial<React.ComponentProps<typeof PickerCentrePin>>) {
  let r!: ReturnType<typeof create>;
  await act(async () => {
    r = create(
      <PickerCentrePin servicesOff={false} isPanning={false} mapFailed={false} {...props} />,
    );
  });
  return r.root.findAllByType(Text).map((t) => String(t.props.children));
}

describe('PickerCentrePin chip', () => {
  it('says "set" when no pin is placed', async () => {
    expect(await chipTexts({ hasPin: false })).toContain('Drag map to set pin');
  });

  it('says "move" once a pin is placed', async () => {
    const texts = await chipTexts({ hasPin: true });
    expect(texts).toContain('Drag map to move pin');
    expect(texts).not.toContain('Drag map to set pin');
  });

  it('defaults to "set" when hasPin is omitted', async () => {
    expect(await chipTexts({})).toContain('Drag map to set pin');
  });

  it('same wording with location services off', async () => {
    expect(await chipTexts({ servicesOff: true, hasPin: true })).toContain('Drag map to move pin');
  });

  it('hides the chip while dragging', async () => {
    expect(await chipTexts({ isPanning: true, hasPin: true })).toHaveLength(0);
  });

  it('hides the chip when the map failed', async () => {
    expect(await chipTexts({ mapFailed: true })).toHaveLength(0);
  });
});
