window.a3d = window.a3d || {};
a3d.gear = (function() {
  function gear( props, thickness, holeDiameter, involutePoints, arcPoints ) {
    involutePoints = involutePoints || 20;
    arcPoints = arcPoints || 360;

    var involuteAngle = Math.sqrt(props.outerRadius*props.outerRadius 
        - props.baseRadius*props.baseRadius) / props.baseRadius;
    var involuteDiffAngle = involuteAngle - Math.atan(involuteAngle);
    var addendumArc = props.toothWidth-2*involuteDiffAngle;
    var addendumPoints = arcPoints*addendumArc/(2*Math.PI);
    var baseArc = 2*Math.PI/props.numTeeth - props.toothWidth;
    var basePoints = arcPoints*baseArc/(2*Math.PI);

    var ctx = new THREE.Path()
    ctx.moveTo(props.baseRadius,0);
    for (var i=0; i<props.numTeeth; i++) {
      var baseAngle = i*2*Math.PI/props.numTeeth;
      for (var j=1; j<=involutePoints; j++)
        lineToPoint( ctx, involute( props.baseRadius, baseAngle, j*involuteAngle/involutePoints, false  ) );
      for (var j=1; j<=addendumPoints; j++)
        lineToPoint( ctx, circlePoint( props.outerRadius, baseAngle+involuteDiffAngle+j*addendumArc/addendumPoints ) );
      for (var j=1; j<=involutePoints; j++)
        lineToPoint( ctx, involute( props.baseRadius, baseAngle+props.toothWidth, 
            (involutePoints-j)*involuteAngle/involutePoints, true ) );
      for (var j=1; j<=basePoints; j++)
        lineToPoint( ctx, circlePoint( props.rootRadius, baseAngle+props.toothWidth+j*baseArc/basePoints ) );
      lineToPoint( ctx, circlePoint( props.rootRadius, baseAngle+props.toothWidth+baseArc ) )
    }


    return ctx.toShapes()[0].extrude({amount:thickness, bevelEnabled:false});
  }

  function rack( props, length, base, thickness ) {
    var tanPA = Math.tan(Math.PI/2-Math.PI*props.pressureAngle/180);
    var left = props.pitchRadius - props.outerRadius;
    var right = props.pitchRadius - props.rootRadius;
    var depth = right - left;
    var sideY = depth / tanPA;
    var pitchY = (props.pitchRadius-props.rootRadius) / tanPA;
    var halfTooth = props.pitchRadius*Math.PI/props.numTeeth;
    var y = 0;

    ctx = new THREE.Path();
    ctx.moveTo( right, y );
    while (y < length) {
      y += halfTooth - 2*pitchY;
      ctx.lineTo( right, y );
      y += sideY;
      ctx.lineTo( left, y );
      y += halfTooth - 2*sideY + 2*pitchY;
      ctx.lineTo( left, y );
      y += sideY;
      ctx.lineTo( right, y );
    }

    ctx.lineTo(base, y);
    ctx.lineTo(base, 0);

    return ctx.toShapes()[0].extrude({amount:thickness, bevelEnabled:false});
  }

  function gearProps( circularPitch, pressureAngle, numTeeth ) {
    var addendum = .8*circularPitch / Math.PI;
    var dedendum = 1.25 * addendum;

    var pitchRadius = numTeeth * circularPitch / (2 * Math.PI);
    var baseRadius = pitchRadius * Math.cos(Math.PI*pressureAngle/180);
    var rootRadius = Math.min(pitchRadius - dedendum, baseRadius);
    return {
      circularPitch:circularPitch, 
      pressureAngle:pressureAngle,
      numTeeth:numTeeth, 
      addendum:addendum, 
      dedendum:dedendum,
      pitchRadius: pitchRadius,
      outerRadius: pitchRadius + addendum,
      baseRadius: baseRadius,
      rootRadius: rootRadius,
      toothWidth: 1*(Math.PI / numTeeth + 2*angleToinvoluteIntersection(pitchRadius, baseRadius ))
    }
  }

  function angleToinvoluteIntersection( radius, baseRadius ) {
    var involuteAngle = Math.sqrt(radius*radius - baseRadius*baseRadius) / baseRadius;
    return involuteAngle - Math.atan(involuteAngle);
  }


  function lineToPoint( ctx, point ) {
    ctx.lineTo( point.x, point.y );
  }

  function circlePoint( radius, angle ) {
    return {x:radius*Math.cos(angle), y:radius*Math.sin(angle)}
  }

  function involute( radius, baseAngle, involuteAngle, right ) {
    var zeroAngle = baseAngle + (right?-1:1) *involuteAngle;
    return {
      x: radius*(Math.cos(zeroAngle) + (right?-1:1) * involuteAngle*Math.sin(zeroAngle)),
      y: radius*(Math.sin(zeroAngle) + (right?1:-1) * involuteAngle*Math.cos(zeroAngle))
    }
  }

  return {gearProps:gearProps, gear:gear, rack:rack}
})();
