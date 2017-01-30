manifold.gear = (function() {
  var M = manifold;

  function gearPath( props, involutePoints, arcPoints ) {
    involutePoints = involutePoints || 20;
    arcPoints = arcPoints || 360;

    var involuteAngle = Math.sqrt(props.outerRadius*props.outerRadius
        - props.baseRadius*props.baseRadius) / props.baseRadius;
    var involuteDiffAngle = involuteAngle - Math.atan(involuteAngle);
    var addendumArc = props.toothWidth-2*involuteDiffAngle;
    var addendumPoints = arcPoints*addendumArc/(2*Math.PI);
    var baseArc = 2*Math.PI/props.numTeeth - props.toothWidth;
    var basePoints = arcPoints*baseArc/(2*Math.PI);

    var path = M.Path([props.baseRadius,0,0]);
    for (var i=0; i<props.numTeeth; i++) {
      var baseAngle = i*2*Math.PI/props.numTeeth;
      for (var j=1; j<=involutePoints; j++)
        path.line( involute( props.baseRadius, baseAngle, j*involuteAngle/involutePoints, false  ) );
      for (var j=1; j<=addendumPoints; j++)
        path.line( circlePoint( props.outerRadius, baseAngle+involuteDiffAngle+j*addendumArc/addendumPoints ) );
      for (var j=1; j<=involutePoints; j++)
        path.line( involute( props.baseRadius, baseAngle+props.toothWidth,
            (involutePoints-j)*involuteAngle/involutePoints, true ) );
      for (var j=1; j<=basePoints; j++)
        path.line( circlePoint( props.rootRadius, baseAngle+props.toothWidth+j*baseArc/basePoints ) );
      path.line( circlePoint( props.rootRadius, baseAngle+props.toothWidth+baseArc ) )
    }


    return path;
  }

  function rackPath( props, length ) {
    var tanPA = Math.tan(Math.PI/2-Math.PI*props.pressureAngle/180);
    var left = props.pitchRadius - props.outerRadius;
    var right = props.pitchRadius - props.rootRadius;
    var depth = right - left;
    var sideY = depth / tanPA;
    var pitchY = (props.pitchRadius-props.rootRadius) / tanPA;
    var halfTooth = props.pitchRadius*Math.PI/props.numTeeth;
    var y = 0;

    var path = M.Path([right, y, 0]);
    while (y < length) {
      y += halfTooth - 2*pitchY;
      path.line( [right, y, 0] );
      y += sideY;
      path.line( [left, y, 0] );
      y += halfTooth - 2*sideY + 2*pitchY;
      path.line( [left, y, 0] );
      y += sideY;
      path.line( [right, y, 0] );
    }
    return path;
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


  function circlePoint( radius, angle ) {
    return [radius*Math.cos(angle), radius*Math.sin(angle), 0]
  }

  function involute( radius, baseAngle, involuteAngle, right ) {
    var zeroAngle = baseAngle + (right?-1:1) *involuteAngle;
    return [
      radius*(Math.cos(zeroAngle) + (right?-1:1) * involuteAngle*Math.sin(zeroAngle)),
      radius*(Math.sin(zeroAngle) + (right?1:-1) * involuteAngle*Math.cos(zeroAngle)),
      0
    ]
  }

  return {gearProps:gearProps, gearPath:gearPath, rackPath:rackPath}
})();
