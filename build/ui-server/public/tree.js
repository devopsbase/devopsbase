dob.tree.isParentSelected = function(node) {
  if (node.selected) return true;
  else if (node.impSelected) return true;
  else if (!node.parent) return false;
  else return dob.tree.isParentSelected(node.parent);
};



dob.tree.colorNodes = function(node, parentSelected) {
  node = node || dob.tree.data;

  var fillColor = dob.tree.colors.default;
  var tooltip = "";

  if (node.label && !dob.labels.isPrimaryLabel(node.label)) {
    fillColor = dob.tree.colors.alias;
    tooltip = "\n\nAlias for:\n" + dob.labels.findPrimaryLabel(node.label).replace(/\//g, ' / ');
  }

  if (node.selected) {
    fillColor = dob.tree.colors.selected;
    tooltip = "Explictly selected by you" + tooltip;
  } else if (node.impSelected) {
    fillColor = dob.tree.colors.impSelected;
    tooltip = "Implicitly selected because an alias is selected" + tooltip;
  } else if (parentSelected && dob.labels.isPrimaryLabel(node.label)) {
    fillColor = dob.tree.colors.impSelected;
    tooltip = "Implicitly selected because parent is selected" + tooltip;
  }

  var d3Node = d3.select("#node-text-" + node.id);
  d3Node.style("fill", fillColor);
  if (node.label && !dob.labels.isPrimaryLabel(node.label)) d3Node.style("font-style", "italic");

  d3.select("#node-tooltip-" + node.id).remove();
  if (!_.isEmpty(tooltip.trim())) d3Node.append("svg:title")
    .attr("id", function(d) { return "node-tooltip-" + d.id; })
    .text(function(d) { return tooltip.trim(); });

  if (!node.children) return;

  if (!parentSelected && (node.selected || node.impSelected)) {
    parentSelected = true;
  }

  node.children.forEach(function(child) {
    dob.tree.colorNodes(child, parentSelected);
  });
};



dob.tree.updateData = function(node, context) {
  node = node || dob.tree.data;

  // for efficiency: build context and pass it to recursive calls
  if (_.isEmpty(context)) {
    context = {
      impSelPrimaryLabels: []
    };

    _.each(dob.filter.labels, function(l) {
      var primaryLabel = dob.labels.findPrimaryLabel(l);

      if (primaryLabel !== l) context.impSelPrimaryLabels.push(primaryLabel);
    });

    context.impSelPrimaryLabels = _.uniq(context.impSelPrimaryLabels);
  }

  if (_.contains(dob.filter.labels, node.label) ||
      _.contains(dob.filter.labels, node.name)) {
    node.selected = true;
  } else if (_.contains(context.impSelPrimaryLabels, node.label)) {
    node.impSelected = true;
  } else {
    delete node.selected;
    delete node.impSelected;
  }

  _.each(node.children, function(node) {
    dob.tree.updateData(node, context);
  });
};



dob.tree.init = function(config, callback) {
  config = config || {};
  callback = callback || _.noop;

  // workaround for correct resizing
  window.dispatchEvent(new Event('resize'));

  if (dob.tree._initiated) return callback();

  var taxonomySource = 'taxonomy_nested.json';
  if (config.includeAlias) taxonomySource = 'taxonomy_nested_alias.json';

  // adapted from http://bl.ocks.org/robschmuecker/7880033
  d3.json(taxonomySource, function(err, treeData) {
    if (err) return callback(err);

    if (dob) dob.tree.data = treeData;

    // Calculate total nodes, max label length
    var totalNodes = 0;
    var maxLabelLength = 0;
    // variables for drag/drop
    var selectedNode = null;
    var draggingNode = null;
    // panning variables
    var panSpeed = 200;
    var panBoundary = 20; // Within 20px from edges will pan when dragging.
    // Misc. variables
    var i = 0;
    var duration = 750;
    var root;

    var tree = d3.layout.tree();

    // size of the diagram
    var calcWidth = function() {
      var width = document.getElementById('tree-container').offsetWidth - 5;
      if (width <= 0) width = 100;

      return width;
    };
    var calcHeight = function() {
      var height = (window.innerHeight || window.clientHeight) - 100;
      if (height <= 0) height = 100;

      return height;
    };

    //var viewerWidth = document.getElementById('tree-container').offsetWidth - 10;
    //var viewerHeight = 600;

    tree.size([calcHeight(), calcWidth()]);

    // responsive size
    window.addEventListener('resize', function() {
      document.querySelector('#tree-container svg').setAttribute('width', calcWidth());
      document.querySelector('#tree-container svg').setAttribute('height', calcHeight());
    }, false);

    // define a d3 diagonal projection for use by the node paths later on.
    var diagonal = d3.svg.diagonal()
      .projection(function(d) {
        return [d.y, d.x];
      });

    // A recursive helper function for performing some setup by walking through all nodes

    function visit(parent, visitFn, childrenFn) {
      if (!parent) return;

      visitFn(parent);

      var children = childrenFn(parent);
      if (children) {
        var count = children.length;
        for (var i = 0; i < count; i++) {
          visit(children[i], visitFn, childrenFn);
        }
      }
    }

    // Call visit function to establish maxLabelLength
    visit(treeData, function(d) {
      totalNodes++;
      maxLabelLength = Math.max(d.name.length, maxLabelLength);

    }, function(d) {
      return d.children && d.children.length > 0 ? d.children : null;
    });


    // sort the tree according to the node names

    function sortTree() {
      tree.sort(function(a, b) {
        return b.name.toLowerCase() < a.name.toLowerCase() ? 1 : -1;
      });
    }
    sortTree();

    // TODO: Pan function, can be better implemented.

    function pan(domNode, direction) {
      var speed = panSpeed;
      if (panTimer) {
        clearTimeout(panTimer);
        translateCoords = d3.transform(svgGroup.attr("transform"));
        if (direction == 'left' || direction == 'right') {
          translateX = direction == 'left' ? translateCoords.translate[0] + speed : translateCoords.translate[0] - speed;
          translateY = translateCoords.translate[1];
        } else if (direction == 'up' || direction == 'down') {
          translateX = translateCoords.translate[0];
          translateY = direction == 'up' ? translateCoords.translate[1] + speed : translateCoords.translate[1] - speed;
        }
        scaleX = translateCoords.scale[0];
        scaleY = translateCoords.scale[1];
        scale = zoomListener.scale();
        svgGroup.transition().attr("transform", "translate(" + translateX + "," + translateY + ")scale(" + scale + ")");
        d3.select(domNode).select('g.node').attr("transform", "translate(" + translateX + "," + translateY + ")");
        zoomListener.scale(zoomListener.scale());
        zoomListener.translate([translateX, translateY]);
        panTimer = setTimeout(function() {
          pan(domNode, speed, direction);
        }, 50);
      }
    }

    // Define the zoom function for the zoomable tree

    function zoom() {
      svgGroup.attr("transform", "translate(" + d3.event.translate + ")scale(" + d3.event.scale + ")");
    }


    // define the zoomListener which calls the zoom function on the "zoom" event constrained within the scaleExtents
    var zoomListener = d3.behavior.zoom()
                                  .scale(1.3) // initial zoom level
                                  .scaleExtent([0.5, 3]) // zoom range
                                  .on("zoom", zoom);

    function initiateDrag(d, domNode) {
      draggingNode = d;
      d3.select(domNode).select('.ghostCircle').attr('pointer-events', 'none');
      d3.selectAll('.ghostCircle').attr('class', 'ghostCircle show');
      d3.select(domNode).attr('class', 'node activeDrag');

      svgGroup.selectAll("g.node").sort(function(a, b) { // select the parent and sort the path's
        if (a.id != draggingNode.id) return 1; // a is not the hovered element, send "a" to the back
        else return -1; // a is the hovered element, bring "a" to the front
      });
      // if nodes has children, remove the links and nodes
      if (nodes.length > 1) {
        // remove link paths
        links = tree.links(nodes);
        nodePaths = svgGroup.selectAll("path.link")
          .data(links, function(d) {
            return d.target.id;
          }).remove();
        // remove child nodes
        nodesExit = svgGroup.selectAll("g.node")
          .data(nodes, function(d) {
            return d.id;
          }).filter(function(d, i) {
            if (d.id == draggingNode.id) {
              return false;
            }
            return true;
          }).remove();
      }

      // remove parent link
      parentLink = tree.links(tree.nodes(draggingNode.parent));
      svgGroup.selectAll('path.link').filter(function(d, i) {
        if (d.target.id == draggingNode.id) {
          return true;
        }
        return false;
      }).remove();

      dragStarted = null;
    }

    // define the baseSvg, attaching a class for styling and the zoomListener
    var baseSvg = d3.select("#tree-container").append("svg")
      .attr("width", calcWidth())
      .attr("height", calcHeight())
      .attr("class", "overlay")
      .call(zoomListener);


    // Define the drag listeners for drag/drop behaviour of nodes.
    var dragListener = d3.behavior.drag()
      .on("dragstart", function(d) {
        if (d == root) {
          return;
        }
        dragStarted = true;
        nodes = tree.nodes(d);
        d3.event.sourceEvent.stopPropagation();
        // it's important that we suppress the mouseover event on the node being dragged. Otherwise it will absorb the mouseover event and the underlying node will not detect it d3.select(this).attr('pointer-events', 'none');
      })
      .on("drag", function(d) {
        if (d == root) {
          return;
        }
        if (dragStarted) {
          domNode = this;
          initiateDrag(d, domNode);
        }

        // get coords of mouseEvent relative to svg container to allow for panning
        var svgElement = document.querySelector('#tree-container svg');
        var relCoords = d3.mouse(svgElement.get(0));
        if (relCoords[0] < panBoundary) {
          panTimer = true;
          pan(this, 'left');
        } else if (relCoords[0] > (svgElement.width() - panBoundary)) {

          panTimer = true;
          pan(this, 'right');
        } else if (relCoords[1] < panBoundary) {
          panTimer = true;
          pan(this, 'up');
        } else if (relCoords[1] > (svgElement.height() - panBoundary)) {
          panTimer = true;
          pan(this, 'down');
        } else {
          try {
            clearTimeout(panTimer);
          } catch (e) {

          }
        }

        d.x0 += d3.event.dy;
        d.y0 += d3.event.dx;
        var node = d3.select(this);
        node.attr("transform", "translate(" + d.y0 + "," + d.x0 + ")");
        updateTempConnector();
      }).on("dragend", function(d) {
        if (d == root) {
          return;
        }
        domNode = this;
        if (selectedNode) {
          // now remove the element from the parent, and insert it into the new elements children
          var index = draggingNode.parent.children.indexOf(draggingNode);
          if (index > -1) {
            draggingNode.parent.children.splice(index, 1);
          }
          if (typeof selectedNode.children !== 'undefined' || typeof selectedNode._children !== 'undefined') {
            if (typeof selectedNode.children !== 'undefined') {
              selectedNode.children.push(draggingNode);
            } else {
              selectedNode._children.push(draggingNode);
            }
          } else {
            selectedNode.children = [];
            selectedNode.children.push(draggingNode);
          }
          // Make sure that the node being added to is expanded so user can see added node is correctly moved
          expand(selectedNode);
          sortTree();
          endDrag();
        } else {
          endDrag();
        }
      });

    function endDrag() {
      selectedNode = null;
      d3.selectAll('.ghostCircle').attr('class', 'ghostCircle');
      d3.select(domNode).attr('class', 'node');
      // now restore the mouseover event or we won't be able to drag a 2nd time
      d3.select(domNode).select('.ghostCircle').attr('pointer-events', '');
      updateTempConnector();
      if (draggingNode !== null) {
        update(root);
        centerNode(draggingNode);
        draggingNode = null;
      }
    }

    // Helper functions for collapsing and expanding nodes.

    function collapse(d) {
      if (d.children) {
        d._children = d.children;
        d._children.forEach(collapse);
        d.children = null;
      }
    }

    function expand(d) {
      if (d._children) {
        d.children = d._children;
        d.children.forEach(expand);
        d._children = null;
      }
    }

    var overCircle = function(d) {
      selectedNode = d;
      updateTempConnector();
    };
    var outCircle = function(d) {
      selectedNode = null;
      updateTempConnector();
    };

    // Function to update the temporary connector indicating dragging affiliation
    var updateTempConnector = function() {
      var data = [];
      if (draggingNode !== null && selectedNode !== null) {
        // have to flip the source coordinates since we did this for the existing connectors on the original tree
        data = [{
          source: {
            x: selectedNode.y0,
            y: selectedNode.x0
          },
          target: {
            x: draggingNode.y0,
            y: draggingNode.x0
          }
        }];
      }
      var link = svgGroup.selectAll(".templink").data(data);

      link.enter().append("path")
        .attr("class", "templink")
        .attr("d", d3.svg.diagonal())
        .attr('pointer-events', 'none');

      link.attr("d", d3.svg.diagonal());

      link.exit().remove();
    };

    // Function to center node when clicked/dropped so node doesn't get lost when collapsing/moving with large amount of children.

    function centerNode(source) {
      scale = zoomListener.scale();
      x = -source.y0;
      y = -source.x0;
      x = x * scale + calcWidth() / 2;
      y = y * scale + calcHeight() / 2;
      d3.select('g').transition()
        .duration(duration)
        .attr("transform", "translate(" + x + "," + y + ")scale(" + scale + ")");
      zoomListener.scale(scale);
      zoomListener.translate([x, y]);
    }

    // Toggle children function

    function toggleChildren(d) {
      if (d.children) {
        d._children = d.children;
        d.children = null;
      } else if (d._children) {
        d.children = d._children;
        d._children = null;
      }
      return d;
    }

    function update(source) {
      // Compute the new height, function counts total children of root node and sets tree height accordingly.
      // This prevents the layout looking squashed when new nodes are made visible or looking sparse when nodes are removed
      // This makes the layout more consistent.
      var levelWidth = [1];
      var childCount = function(level, n) {

        if (n.children && n.children.length > 0) {
          if (levelWidth.length <= level + 1) levelWidth.push(0);

          levelWidth[level + 1] += n.children.length;
          n.children.forEach(function(d) {
            childCount(level + 1, d);
          });
        }
      };
      childCount(0, root);
      var newHeight = d3.max(levelWidth) * 25; // 25px per line  
      tree = tree.size([newHeight, calcWidth()]);

      // Compute the new tree layout.
      var nodes = tree.nodes(root).reverse();
      var links = tree.links(nodes);

      // Set widths between levels based on maxLabelLength.
      nodes.forEach(function(d) {
        d.y = (d.depth * (maxLabelLength * 10)); //maxLabelLength * 10px
        // alternatively to keep a fixed scale one can set a fixed depth per level
        // Normalize for fixed-depth by commenting out below line
        // d.y = (d.depth * 500); //500px per level.
      });

      // Update the nodes...
      node = svgGroup.selectAll("g.node")
        .data(nodes, function(d) {
          return d.id || (d.id = ++i);
        });

      // Enter any new nodes at the parent's previous position.
      var nodeEnter = node.enter().append("g")
        //.call(dragListener) //TODO drag and drop disabled
        .attr("class", "node")
        .attr("transform", function(d) {
          return "translate(" + source.y0 + "," + source.x0 + ")";
        });
        //.on("click", ...);

      nodeEnter.append("circle")
        .attr('class', 'nodeCircle')
        .attr("r", 0)
        .style("fill", function(d) {
          return d._children ? "lightsteelblue" : "#fff";
        })
        .on("click", function(d) {
          if (d3.event.defaultPrevented) return; // click suppressed
          d = toggleChildren(d);
          update(d);
          centerNode(d);

          dob.tree.updateData(); // updateData(d)
          dob.tree.colorNodes(); // colorNodes(d)
        });

  /*
  nodeEnter.append("a")
    .attr("xlink:href", function(d) { return d.url || 'http://'; })
    .append("text")
    .attr("x", function(d) { return d.children || d._children ? -10 : 10; })
    .attr("dy", ".35em")
    .attr("text-anchor", function(d) { return d.children || d._children ? "end" : "start"; })
    .text(function(d) { return d.name; })
    .style("fill", function(d) { return d.free ? "black" : "#999"; })
    .style("fill-opacity", 1e-6);
  */

      nodeEnter.append("text").attr("x", function(d) {
          return d.children || d._children ? -10 : 10;
        })
        .attr("id", function(d) {
          return "node-text-" + d.id;
        })
        .attr("dy", ".35em")
        .attr("class", "nodeText")
        .attr("text-anchor", function(d) {
          return d.children || d._children ? "end" : "start";
        })
        .attr("labelName", function(d) {
          return d.label || d.name;
        })
        .text(function(d) {
          return d.name;
        })
        .style("fill-opacity", 0)
        .on("click", function(d, i) {
          if (d === root) return;

          d.selected = !d.selected;

          if (d.selected) {
            dob.filter.labels.push(d.label || d.name);
          } else {
            var index = dob.filter.labels.indexOf(d.label || d.name);

            if (index > -1) dob.filter.labels.splice(index, 1);
          }

          dob.tree.updateData();
          dob.tree.colorNodes(); // colorNodes(d)
        });

      // phantom node to give us mouseover in a radius around it
      nodeEnter.append("circle")
        .attr('class', 'ghostCircle')
        .attr("r", 30)
        .attr("opacity", 0.2) // change this to zero to hide the target area
        .style("fill", "red")
        .attr('pointer-events', 'mouseover')
        .on("mouseover", function(node) {
          overCircle(node);
        })
        .on("mouseout", function(node) {
          outCircle(node);
        });

      // Update the text to reflect whether node has children or not.
      node.select('text')
        .attr("x", function(d) {
          return d.children || d._children ? -10 : 10;
        })
        .attr("text-anchor", function(d) {
          return d.children || d._children ? "end" : "start";
        })
        .text(function(d) {
          //if (d.aliasFor) return d.name + ' (alias)';
          //else 
          return d.name;
        });

      // Change the circle fill depending on whether it has children and is collapsed
      node.select("circle.nodeCircle")
        .attr("r", 4.5)
        .style("fill", function(d) {
          return d._children ? "lightsteelblue" : "#fff";
        });

      // Transition nodes to their new position.
      var nodeUpdate = node.transition()
        .duration(duration)
        .attr("transform", function(d) {
          return "translate(" + d.y + "," + d.x + ")";
        });

      // Fade the text in
      nodeUpdate.select("text")
        .style("fill-opacity", 1);

      // Transition exiting nodes to the parent's new position.
      var nodeExit = node.exit().transition()
        .duration(duration)
        .attr("transform", function(d) {
          return "translate(" + source.y + "," + source.x + ")";
        })
        .remove();

      nodeExit.select("circle")
        .attr("r", 0);

      nodeExit.select("text")
        .style("fill-opacity", 0);

      // Update the links…
      var link = svgGroup.selectAll("path.link")
        .data(links, function(d) {
          return d.target.id;
        });

      // Enter any new links at the parent's previous position.
      link.enter().insert("path", "g")
        .attr("class", "link")
        .attr("d", function(d) {
          var o = {
            x: source.x0,
            y: source.y0
          };
          return diagonal({
            source: o,
            target: o
          });
        });

      // Transition links to their new position.
      link.transition()
        .duration(duration)
        .attr("d", diagonal);

      // Transition exiting nodes to the parent's new position.
      link.exit().transition()
        .duration(duration)
        .attr("d", function(d) {
          var o = {
            x: source.x,
            y: source.y
          };
          return diagonal({
            source: o,
            target: o
          });
        })
        .remove();

      // Stash the old positions for transition.
      nodes.forEach(function(d) {
        d.x0 = d.x;
        d.y0 = d.y;
      });
    }

    // Append a group which holds all nodes and which the zoom Listener can act upon.
    var svgGroup = baseSvg.append("g");

    // Define the root
    root = treeData;
    root.x0 = calcHeight() / 2;
    root.y0 = 0;

    // Start in compact mode
    root.children.forEach(collapse);

    // Layout the tree initially and center on the root node.
    update(root);
    centerNode(root);

    dob.tree._initiated = true;

    callback();
  });
};
