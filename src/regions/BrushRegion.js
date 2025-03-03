import React from "react";
import { Line, Shape, Group, Layer } from "react-konva";
import { observer } from "mobx-react";
import { types, getParent, getRoot, isAlive } from "mobx-state-tree";

import Canvas from "../utils/canvas";
import NormalizationMixin from "../mixins/Normalization";
import RegionsMixin from "../mixins/Regions";
import Registry from "../core/Registry";
import WithStatesMixin from "../mixins/WithStates";
import { ImageModel } from "../tags/object/Image";
import { LabelOnMask } from "../components/ImageView/LabelOnRegion";
import { guidGenerator } from "../core/Helpers";
import { AreaMixin } from "../mixins/AreaMixin";

const highlightOptions = {
  shadowColor: "red",
  shadowBlur: 1,
  shadowOffsetY: 2,
  shadowOffsetX: 2,
  shadowOpacity: 1,
};

const Points = types
  .model("Points", {
    id: types.optional(types.identifier, guidGenerator),
    type: types.optional(types.enumeration(["add", "eraser"]), "add"),
    points: types.array(types.number),
    /**
     * Stroke width
     */
    strokeWidth: types.optional(types.number, 25),
  })
  .views(self => ({
    get store() {
      return getRoot(self);
    },
    get parent() {
      return getParent(self, 2);
    },
  }))
  .actions(self => ({
    setType(type) {
      self.type = type;
    },

    addPoints(x, y) {
      // scale it back because it would be scaled on draw
      self.points.push(x / self.parent.scaleX);
      self.points.push(y / self.parent.scaleY);
    },

    // rescale points to the new width and height from the original
    rescale(origW, origH, destW, destH) {
      const s = destW / origW;
      return self.points.map(p => p * s);
    },

    scaledStrokeWidth(origW, origH, destW, destH) {
      const s = destW / origW;
      return s * self.strokeWidth;
    },
  }));

/**
 * Rectangle object for Bounding Box
 *
 */
const Model = types
  .model({
    id: types.optional(types.identifier, guidGenerator),
    pid: types.optional(types.string, guidGenerator),

    type: "brushregion",
    object: types.late(() => types.reference(ImageModel)),

    coordstype: types.optional(types.enumeration(["px", "perc"]), "perc"),

    rle: types.frozen(),

    touches: types.array(Points),
    currentTouch: types.maybeNull(types.reference(Points)),
  })
  .volatile(self => ({
    /**
     * Higher values will result in a more curvy line. A value of 0 will result in no interpolation.
     */
    tension: 1.0,
    /**
     * Stroke color
     */
    // strokeColor: types.optional(types.string, "red"),

    /**
     * Determines node opacity. Can be any number between 0 and 1
     */
    opacity: 1,
    scaleX: 1,
    scaleY: 1,

    // points: types.array(types.array(types.number)),
    // eraserpoints: types.array(types.array(types.number)),

    mode: "brush",

    needsUpdate: 1,
    hideable: true,
  }))
  .views(self => ({
    get parent() {
      return self.object;
    },
  }))
  .actions(self => ({
    afterCreate() {
      // if ()
      // const newdata = ctx.createImageData(750, 937);
      // newdata.data.set(decode(item._rle));
      // const dec = decode(self._rle);
      // self._rle_image =
      // item._cached_mask = decode(item._rle);
      // const newdata = ctx.createImageData(750, 937);
      //     newdata.data.set(item._cached_mask);
      //     var img = imagedata_to_image(newdata);
    },

    addTouch({ type, strokeWidth }) {
      const p = Points.create({ id: guidGenerator(), type: type, strokeWidth: strokeWidth });
      self.touches.push(p);
      self.currentTouch = p;

      return p;
    },

    convertPointsToMask() {},

    // addPoints(x, y, mode) {
    //   if (mode) self.mode = "eraser";
    //   self.points.push(x);
    //   self.points.push(y);
    // },

    // addEraserPoints(x, y) {
    //   self.eraserpoints = [...self.eraserpoints, x, y];
    // },

    setScale(x, y) {
      self.scaleX = x;
      self.scaleY = y;
    },

    updateImageSize(wp, hp, sw, sh) {
      if (self.parent.initialWidth > 1 && self.parent.initialHeight > 1) {
        let ratioX = self.parent.stageWidth / self.parent.initialWidth;
        let ratioY = self.parent.stageHeight / self.parent.initialHeight;

        self.setScale(ratioX, ratioY);

        self.needsUpdate = self.needsUpdate + 1;
      }
    },

    addState(state) {
      self.states.push(state);
    },

    serialize() {
      const object = self.object;
      const rle = Canvas.Region2RLE(self, object, {
        stroke: self.strokeColor,
        tension: self.tension,
      });

      if (!rle || !rle.length) return null;

      const res = {
        original_width: object.naturalWidth,
        original_height: object.naturalHeight,
        value: {
          format: "rle",
          // UInt8Array serializes as object, not an array :(
          rle: Array.from(rle),
        },
      };

      return res;
    },
  }));

const BrushRegionModel = types.compose(
  "BrushRegionModel",
  WithStatesMixin,
  RegionsMixin,
  NormalizationMixin,
  AreaMixin,
  Model,
);

const HtxBrushLayer = observer(({ item, points }) => {
  const highlight = item.highlighted ? highlightOptions : { shadowOpacity: 0 };
  const params =
    points.type === "add"
      ? {
          ...highlight,
          opacity: item.mode === "brush" ? item.opacity : 1,
          globalCompositeOperation: "source-over",
        }
      : {
          opacity: 1,
          globalCompositeOperation: "destination-out",
        };

  return (
    <Line
      onMouseDown={e => {
        e.cancelBubble = false;
      }}
      points={[...points.points]}
      stroke={item.style.strokecolor}
      strokeWidth={points.strokeWidth}
      lineJoin={"round"}
      lineCap="round"
      tension={item.tension}
      {...params}
    />
  );
});

const HtxBrushView = ({ item }) => {
  if (!isAlive(item)) return null;
  if (item.hidden) return null;

  const { store } = item;

  // if (item.parent.stageRef && item._rle) {
  //     const sref = item.parent.stageRef;
  //     const ctx = sref.getLayers()[0].getContext("2d");
  //     const newdata = ctx.createImageData(item.parent.stageWidth, item.parent.stageHeight);

  //     newdata.data.set(decode(item._rle));

  //     // newdata.data.set(RLEdecode(_rle))
  //     ctx.putImageData(newdata, 0, 0);
  // }

  let highlight = item.highlighted ? highlightOptions : { shadowOpacity: 0 };

  return (
    <Layer id={item.cleanId}>
      <Group
        attrMy={item.needsUpdate}
        name="segmentation"
        // onClick={e => {
        //     e.cancelBubble = false;
        // }}
        // onMouseDown={e => {
        //     console.log("down");
        //     e.cancelBubble = false;
        // }}
        onMouseOver={e => {
          const stage = item.parent.stageRef;

          if (store.annotationStore.selected.relationMode) {
            item.setHighlight(true);
            stage.container().style.cursor = "crosshair";
          } else {
            // no tool selected
            if (!item.parent.getToolsManager().findSelectedTool()) stage.container().style.cursor = "pointer";
          }
        }}
        onMouseOut={e => {
          if (store.annotationStore.selected.relationMode) {
            item.setHighlight(false);
          }

          if (!item.parent.getToolsManager().findSelectedTool()) {
            const stage = item.parent.stageRef;
            stage.container().style.cursor = "default";
          }
        }}
        onClick={e => {
          if (store.annotationStore.selected.relationMode) {
            item.onClickRegion();
            return;
          }

          if (item.parent.getToolsManager().findSelectedTool()) return;

          const stage = item.parent.stageRef;

          if (store.annotationStore.selected.relationMode) {
            stage.container().style.cursor = "default";
          }

          item.setHighlight(false);
          item.onClickRegion();
        }}
      >
        {/* @todo rewrite this to just an Konva.Image, much simplier */}
        {/* @todo and this will allow to use scale on parent Group */}
        <Shape
          sceneFunc={(ctx, shape) => {
            if (item.parent.naturalWidth === 1) return null;

            if (item._loadedOnce === true) {
              ctx.drawImage(item._img, 0, 0, item.parent.stageWidth, item.parent.stageHeight);
              ctx.fillStrokeShape(shape);

              return;
            }

            if (item.rle) {
              const img = Canvas.RLE2Region(item.rle, item.parent);
              item._loadedOnce = true;

              img.onload = function() {
                ctx.drawImage(img, 0, 0, item.parent.stageWidth, item.parent.stageHeight);
                ctx.fillStrokeShape(shape);
              };

              item._img = img;
            }
          }}
          opacity={1}
          {...highlight}
        />

        <Group scaleX={item.scaleX} scaleY={item.scaleY}>
          {item.touches.map(p => (
            <HtxBrushLayer key={p.id} store={store} item={item} points={p} />
          ))}

          <LabelOnMask item={item} />
        </Group>
      </Group>
    </Layer>
  );
};

const HtxBrush = observer(HtxBrushView);

Registry.addTag("brushregion", BrushRegionModel, HtxBrush);
Registry.addRegionType(BrushRegionModel, "image", value => value.rle || value.touches);

export { BrushRegionModel, HtxBrush };
